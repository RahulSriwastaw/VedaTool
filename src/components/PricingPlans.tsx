import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { SubscriptionPlan, getCleanDisplayName } from "../types";
import { ArrowLeft, Coins, Zap, HelpCircle, IndianRupee } from "lucide-react";
import { motion } from "motion/react";
import { usePlanLimits } from "../hooks/usePlanLimits";

// Dynamically load razorpay script
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => {
      resolve(true);
    };
    script.onerror = () => {
      resolve(false);
    };
    document.body.appendChild(script);
  });
};

interface PricingPlansProps {
  onBack: () => void;
}

const PricingPlans: React.FC<PricingPlansProps> = ({ onBack }) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingPackId, setPurchasingPackId] = useState<string | null>(null);
  const [user] = useAuthState(auth);
  const { tokens, rates } = usePlanLimits();

  useEffect(() => {
    fetchPlans();
    loadRazorpayScript();
  }, []);

  const fetchPlans = async () => {
    try {
      const snap = await getDocs(collection(db, "plans"));
      const activePlans: SubscriptionPlan[] = [];
      snap.forEach((d) => {
        const plan = { id: d.id, ...d.data() } as SubscriptionPlan;
        if (plan.isActive) activePlans.push(plan);
      });
      // Sort by USD price
      setPlans(activePlans.sort((a, b) => a.price - b.price));
    } catch (e) {
      console.error("Error fetching active plans / packs:", e);
    } finally {
      setLoading(false);
    }
  };

  const verifyPaymentAndAddTokens = async (
    response: any,
    pack: SubscriptionPlan,
  ) => {
    try {
      if (!user) return;
      const verifyRes = await fetch("/api/razorpay/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        }),
      });

      const verifyData = await verifyRes.json();
      if (verifyData.success) {
        // Increment user token balance directly
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        let currentTokens = 50;
        if (userSnap.exists() && userSnap.data().tokens !== undefined) {
          currentTokens = Number(userSnap.data().tokens);
        }
        const tokensToGrant = pack.tokensCount ?? 1000;
        const nextTokens = currentTokens + tokensToGrant;
        await setDoc(userRef, { tokens: nextTokens }, { merge: true });

        // Save Transaction database log (INR amount)
        const chargedInr = Math.round(pack.price);
        await addDoc(collection(db, "payments"), {
          userId: user.uid,
          userEmail: user.email,
          packId: pack.id,
          planName: `${pack.name} (+${tokensToGrant.toLocaleString()} Veda Tokens)`,
          amount: chargedInr,
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          status: "success",
          createdAt: serverTimestamp(),
        });

        alert(
          `Recharge Successful! Credited ${tokensToGrant.toLocaleString()} Veda Tokens to your workspace wallet.`,
        );
        onBack();
      } else {
        alert("Payment Verification Failed: " + verifyData.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error recording token credits.");
    } finally {
      setPurchasingPackId(null);
    }
  };

  const handlePurchaseTokens = async (pack: SubscriptionPlan) => {
    if (!user) {
      alert("Please login first to purchase token packs.");
      return;
    }
    setPurchasingPackId(pack.id);

    // If price is 0, claim for free directly
    if (Number(pack.price) === 0) {
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        let currentTokens = 50;
        if (userSnap.exists() && userSnap.data().tokens !== undefined) {
          currentTokens = Number(userSnap.data().tokens);
        }
        const tokensToGrant = pack.tokensCount ?? 1000;
        const nextTokens = currentTokens + tokensToGrant;
        await setDoc(userRef, { tokens: nextTokens }, { merge: true });

        // Save Transaction database log (0 amount)
        await addDoc(collection(db, "payments"), {
          userId: user.uid,
          userEmail: user.email,
          packId: pack.id,
          planName: `${pack.name} (+${tokensToGrant.toLocaleString()} Veda Tokens - FREE)`,
          amount: 0,
          orderId: "free_claim_" + Date.now(),
          paymentId: "free_claim_" + Date.now(),
          status: "success",
          createdAt: serverTimestamp(),
        });

        alert(
          `Claim Successful! Credited ${tokensToGrant.toLocaleString()} free Veda Tokens to your workspace wallet.`,
        );
        onBack();
      } catch (e: any) {
        console.error(e);
        alert("Error claiming free tokens.");
      } finally {
        setPurchasingPackId(null);
      }
      return;
    }

    try {
      const priceInr = Math.round(pack.price);
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: priceInr,
          currency: "INR",
          receipt: `tokens_${Date.now()}`,
        }),
      });
      const order = await res.json();

      if (!order.id) {
        alert(
          "Could not process order. Verify dynamic setup of server Razorpay credentials.",
        );
        setPurchasingPackId(null);
        return;
      }

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Veda Workspace top-up",
        description: `Buy ${pack.name}: +${(pack.tokensCount ?? 1000).toLocaleString()} Veda Tokens`,
        order_id: order.id,
        handler: function (response: any) {
          verifyPaymentAndAddTokens(response, pack);
        },
        prefill: {
          name: getCleanDisplayName(user.displayName, user.email),
          email: user.email || "",
        },
        theme: {
          color: "#FF6B2B",
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", function (rr: any) {
        alert(rr.error.description);
        setPurchasingPackId(null);
      });
      rzp.open();
    } catch (err) {
      console.error(err);
      alert("Token transaction failure.");
      setPurchasingPackId(null);
    }
  };

  if (loading)
    return (
      <div className="text-[#EFEFEF] text-center py-9 font-sans tracking-wide">
        Loading token options...
      </div>
    );

  const pdfRate = rates?.pdfConverter || { system: 50, custom: 2 };
  const mcqRate = rates?.mcqExtractor || { system: 50, custom: 2 };
  const youtubeRate = rates?.youtubeSeo || { system: 40, custom: 2 };
  const chatRate = rates?.chatApp || { system: 15, custom: 1 };

  return (
    <div className="max-w-6xl mx-auto px-1 sm:px-1 py-1 md:py-3 font-sans">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[#888888] hover:text-[#EFEFEF] mb-3 transition-colors text-[11px] font-bold uppercase tracking-wider"
      >
        <ArrowLeft size={14} /> Back to Hub
      </button>

      {/* TOP USER BALANCE BOARD */}
      <div className="bg-[#1A1A1A] card rounded-2xl p-2 mb-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-[12px]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--success-bg)] border border-[var(--success-border)] flex items-center justify-center text-[var(--success-text)] shrink-0">
            <Coins size={24} />
          </div>
          <div>
            <h4 className="text-[#EFEFEF] font-bold text-[13px]">
              Veda Workspace Token Wallet
            </h4>
            <p className="text-[11px] text-[#888888] mt-1">
              Your balance is used dynamically across all our layout parsers,
              MCQ compilers, creators, and conversational helpers.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-1">
          <span className="text-[11px] text-[#555555] font-medium font-sans">
            Current Balance
          </span>
          <span className="text-[20px] font-black text-[var(--success-text)] font-mono bg-[var(--success-bg)] px-2 py-1 rounded-xl border border-[var(--success-border)]">
            {tokens.toLocaleString()} Tokens
          </span>
        </div>
      </div>

      {/* DUAL DIVISION */}
      <div className="text-center mb-4">
        <h1 className="text-4xl text-[#EFEFEF] font-extrabold tracking-tight mb-1">
          Recharge Veda Tokens
        </h1>
        <p className="text-[#888888] max-w-xl mx-auto text-[13px]">
          Select a dynamic token package. All transactions are securely routed
          via Razorpay and tokens are credited to your email instantly.
        </p>
      </div>

      {/* 1. TOKENS RECHARGE SECTION */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px] mb-7">
        {plans.map((pack) => {
          const isBuyingThis = purchasingPackId === pack.id;
          const tokensCount = pack.tokensCount ?? 1000;
          return (
            <motion.div
              key={pack.id}
              whileHover={{ y: -5 }}
              className="bg-[#1A1A1A] card rounded-2xl p-2 flex flex-col relative overflow-hidden transition-all duration-300  justify-between min-h-[320px]"
            >
              <div>
                <div className="mb-1">
                  <span className="text-[11px] text-[#FF6B2B] font-bold tracking-wider uppercase">
                    Recharge pack
                  </span>
                  <h3 className="text-[15px] font-black text-slate-100 mt-1">
                    {pack.name}
                  </h3>
                </div>

                <div className="mb-2 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-[var(--success-text)] font-mono">
                    {tokensCount.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-[#555555] font-bold uppercase tracking-wider">
                    Tokens
                  </span>
                </div>

                <p className="text-[11px] text-[#888888] leading-relaxed mb-2">
                  {pack.description || "No description loaded."}
                </p>
              </div>

              <div className="border-t border-[var(--border-default)] pt-1 mt-auto">
                <div className="flex items-center justify-between gap-4 mb-1">
                  <span className="text-[11px] text-[#555555] font-medium font-sans">
                    Recharge Price
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-[15px] font-extrabold text-[#FF6B2B] font-sans flex items-center gap-0.5">
                      {Number(pack.price) === 0 ? (
                        "FREE"
                      ) : (
                        <>
                          <IndianRupee
                            size={15}
                            className="shrink-0 inline-block text-[#FF6B2B]"
                          />
                          <span>{pack.price}</span>
                        </>
                      )}
                    </span>
                    {Number(pack.price) > 0 && (
                      <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-wider">
                        INR
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handlePurchaseTokens(pack)}
                  disabled={!!purchasingPackId}
                  className={`w-full py-1 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all duration-300 ${
                    Number(pack.price) === 0
                      ? "bg-amber-500 hover:bg-amber-600 text-black  shadow-amber-500/10"
                      : "bg-emerald-500 hover:bg-emerald-600 text-black  shadow-emerald-500/10"
                  } disabled:opacity-50`}
                >
                  {isBuyingThis
                    ? "PROCESSING..."
                    : Number(pack.price) === 0
                      ? "CLAIM FREE PACK"
                      : "RECHARGE WALLET"}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 2. LIVE DYNAMIC RATES VIEW */}
      <div className="bg-[#1A1A1A] card rounded-2xl p-2 mb-7 max-w-4xl mx-auto">
        <h3 className="text-md font-bold text-[#EFEFEF] mb-1 flex items-center gap-2">
          <HelpCircle size={18} className="text-[#FF6B2B]" /> Veda Live Token
          Consumption Rates
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-[12px] text-[11px] leading-relaxed text-[#888888]">
          <div className="bg-[#1A1A1A] card p-2 flex flex-col justify-between">
            <div>
              <h4 className="text-[#EFEFEF] font-bold text-[11px] uppercase mb-1 flex items-center gap-1">
                <Zap size={12} className="text-[#FF6B2B]" /> PDF Extractor
              </h4>
              <p className="mt-1 text-[#888888] text-[11px]">
                Dynamical OCR and multimodal block extractor.
              </p>
            </div>
            <div className="mt-1 border-t border-[var(--border-default)] pt-1 font-mono text-[10px] leading-relaxed">
              <div className="flex justify-between">
                <span>System API:</span>
                <span className="text-[var(--success-text)] font-semibold text-right">
                  {pdfRate.system} / page
                </span>
              </div>
              <div className="flex justify-between">
                <span>Custom API:</span>
                <span className="text-[var(--warning-text)] font-semibold text-right">
                  {pdfRate.custom} / page
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#1A1A1A] card p-2 flex flex-col justify-between">
            <div>
              <h4 className="text-[#EFEFEF] font-bold text-[11px] uppercase mb-1 flex items-center gap-1">
                <Zap size={12} className="text-[#FF6B2B]" /> Question Extractor
              </h4>
              <p className="mt-1 text-[#888888] text-[11px]">
                Convert complex multi-page files to Question pools.
              </p>
            </div>
            <div className="mt-1 border-t border-[var(--border-default)] pt-1 font-mono text-[10px] leading-relaxed">
              <div className="flex justify-between">
                <span>System API:</span>
                <span className="text-[var(--success-text)] font-semibold text-right">
                  {mcqRate.system} / page
                </span>
              </div>
              <div className="flex justify-between">
                <span>Custom API:</span>
                <span className="text-[var(--warning-text)] font-semibold text-right">
                  {mcqRate.custom} / page
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#1A1A1A] card p-2 flex flex-col justify-between">
            <div>
              <h4 className="text-[#EFEFEF] font-bold text-[11px] uppercase mb-1 flex items-center gap-1">
                <Zap size={12} className="text-[#FF6B2B]" /> YouTube SEO
              </h4>
              <p className="mt-1 text-[#888888] text-[11px]">
                Generate optimized transcripts, tags & tagsheets.
              </p>
            </div>
            <div className="mt-1 border-t border-[var(--border-default)] pt-1 font-mono text-[10px] leading-relaxed">
              <div className="flex justify-between">
                <span>System API:</span>
                <span className="text-[var(--success-text)] font-semibold text-right">
                  {youtubeRate.system} / use
                </span>
              </div>
              <div className="flex justify-between">
                <span>Custom API:</span>
                <span className="text-[var(--warning-text)] font-semibold text-right">
                  {youtubeRate.custom} / use
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#1A1A1A] card p-2 flex flex-col justify-between">
            <div>
              <h4 className="text-[#EFEFEF] font-bold text-[11px] uppercase mb-1 flex items-center gap-1">
                <Zap size={12} className="text-[#FF6B2B]" /> AI Assistant
              </h4>
              <p className="mt-1 text-[#888888] text-[11px]">
                Live responsive tutoring, chatbot analysis & prompts.
              </p>
            </div>
            <div className="mt-1 border-t border-[var(--border-default)] pt-1 font-mono text-[10px] leading-relaxed">
              <div className="flex justify-between">
                <span>System API:</span>
                <span className="text-[var(--success-text)] font-semibold text-right">
                  {chatRate.system} / msg
                </span>
              </div>
              <div className="flex justify-between">
                <span>Custom API:</span>
                <span className="text-[var(--warning-text)] font-semibold text-right">
                  {chatRate.custom} / msg
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingPlans;
