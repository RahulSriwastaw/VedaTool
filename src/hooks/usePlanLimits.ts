import { useState, useEffect } from "react";
import { db, auth } from "../services/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { doc, getDoc, setDoc, increment, onSnapshot } from "firebase/firestore";
import { PlanLimits, UserUsage, SubscriptionPlan, ToolRates } from "../types";

const DEFAULT_LIMITS: PlanLimits = {
  pdfDailySystemApi: 10,
  pdfDailyPersonalApi: 10,
  chatDailySystemApi: 10,
  chatDailyPersonalApi: 10,
};

const DEFAULT_RATES: ToolRates = {
  pdfConverter: { system: 50, custom: 2 },
  mcqExtractor: { system: 50, custom: 2 },
  youtubeSeo: { system: 40, custom: 2 },
  chatApp: { system: 15, custom: 1 },
};

export const usePlanLimits = () => {
  const [user] = useAuthState(auth);
  const [limits, setLimits] = useState<PlanLimits>(DEFAULT_LIMITS);
  const [usage, setUsage] = useState<UserUsage>({
    dateId: new Date().toISOString().split("T")[0],
    pdfSystemApiCount: 0,
    pdfPersonalApiCount: 0,
    chatSystemApiCount: 0,
    chatPersonalApiCount: 0,
  });
  const [plan, setPlan] = useState<{ id: string; name: string; historyValidityDays?: number }>({
    id: "free",
    name: "Free",
  });
  const [tokens, setTokens] = useState<number>(5000);
  const [rates, setRates] = useState<ToolRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);

  // Load Tool Rates from Firestore Setting
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const ratesSnap = await getDoc(doc(db, "settings", "rates"));
        if (ratesSnap.exists()) {
          setRates(ratesSnap.data() as ToolRates);
        }
      } catch (err: any) {
        const msg = (err?.message || "").toLowerCase();
        if (msg.includes("offline") || msg.includes("could not reach") || msg.includes("failed to get")) {
          console.log("[usePlanLimits] Local offline default rates loaded successfully.");
        } else {
          console.warn("[usePlanLimits] Graceful bypass: standard rate settings loaded from local defaults:", err);
        }
      }
    };
    fetchRates();
  }, []);

  // Sync tokens via global event (for guest state or when another component updates)
  useEffect(() => {
    const handleTokenSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.remaining !== undefined) {
        setTokens(customEvent.detail.remaining);
      }
    };
    window.addEventListener("whiteboard-token-deduction", handleTokenSync);
    return () =>
      window.removeEventListener("whiteboard-token-deduction", handleTokenSync);
  }, []);

  useEffect(() => {
    if (!user) {
      const dateId = new Date().toISOString().split("T")[0];
      const localKey = `guest_usage_${dateId}`;
      try {
        const stored = localStorage.getItem(localKey);
        if (stored) {
          setUsage(JSON.parse(stored));
        } else {
          setUsage({
            dateId,
            pdfSystemApiCount: 0,
            pdfPersonalApiCount: 0,
            chatSystemApiCount: 0,
            chatPersonalApiCount: 0,
          });
        }
      } catch (e) {
        console.error("Failed to parse guest usage", e);
      }

      // Load guest tokens
      const localGuestTokensKey = "guest_whiteboard_tokens";
      let gTokens = 5000;
      const storedTokens = localStorage.getItem(localGuestTokensKey);
      if (storedTokens !== null) {
        gTokens = parseInt(storedTokens, 10);
      } else {
        localStorage.setItem(localGuestTokensKey, "5000");
      }
      setTokens(gTokens);
      setLimits(DEFAULT_LIMITS);
      setPlan({ id: "free", name: "Free" });
      setLoading(false);
      return;
    }

    let unsubscribeUser: undefined | (() => void);

    const fetchLimitsAndUsage = async () => {
      try {
        const dateId = new Date().toISOString().split("T")[0];

        // 1. Get usage
        const usageRef = doc(db, `users/${user.uid}/usage/${dateId}`);
        const usageSnap = await getDoc(usageRef);
        let currentUsage = {
          dateId,
          pdfSystemApiCount: 0,
          pdfPersonalApiCount: 0,
          chatSystemApiCount: 0,
          chatPersonalApiCount: 0,
        };
        if (usageSnap.exists()) {
          currentUsage = { ...currentUsage, ...usageSnap.data() } as UserUsage;
        }
        setUsage(currentUsage);

        // 2. Setup real-time listener for user subscription & tokens
        const userRef = doc(db, "users", user.uid);

        unsubscribeUser = onSnapshot(
          userRef,
          async (userSnap) => {
            let currLimits = DEFAULT_LIMITS;
            let currPlan: { id: string; name: string; historyValidityDays?: number } = { id: "free", name: "Free" };
            let userTokens = 5000;
            const currentMonthId = new Date().toISOString().substring(0, 7);

            if (userSnap.exists()) {
              const userData = userSnap.data();
              let currentTokens =
                userData.tokens !== undefined ? Number(userData.tokens) : 5000;

              // Check if monthly free token bonus needs to be credited
              if (userData.lastMonthlyCreditMonth !== currentMonthId) {
                currentTokens = currentTokens + 5000;
                // Avoid infinite loop by performing setDoc outside of snapshot loop if necessary,
                // but it will trigger another snapshot which is fine.
                setDoc(
                  userRef,
                  {
                    tokens: currentTokens,
                    lastMonthlyCreditMonth: currentMonthId,
                    uid: user.uid,
                    email: user.email || "",
                  },
                  { merge: true },
                );
              }
              userTokens = currentTokens;

              if (userData.subscription && userData.subscription.isActive) {
                const { planId, expiresAt } = userData.subscription;
                // Verify if not expired
                if (!expiresAt || expiresAt > Date.now()) {
                  const planSnap = await getDoc(doc(db, "plans", planId));
                  if (planSnap.exists()) {
                    const planData = planSnap.data() as SubscriptionPlan;
                    currLimits = planData.limits;
                    currPlan = {
                      id: planSnap.id,
                      name: planData.name,
                      historyValidityDays: planData.historyValidityDays,
                    };
                  }
                }
              }
            } else {
              // Initialize user document with 5000 tokens (signup bonus) and current month id
              await setDoc(
                userRef,
                {
                  tokens: 5000,
                  lastMonthlyCreditMonth: currentMonthId,
                  uid: user.uid,
                  email: user.email || "",
                },
                { merge: true },
              );
              userTokens = 5000;
            }

            setTokens(userTokens);
            setLimits(currLimits);
            setPlan(currPlan);
            setLoading(false);
          },
          (err) => {
            const msg = (err?.message || "").toLowerCase();
            if (!msg.includes("offline") && !msg.includes("could not reach") && !msg.includes("failed to get")) {
              console.warn("Failed to fetch limits", err);
            } else {
              console.log("[usePlanLimits] Offline mode active: User updates suspended until connection resumes.");
            }
            setLoading(false);
          },
        );
      } catch (err: any) {
        const msg = (err?.message || "").toLowerCase();
        if (!msg.includes("offline") && !msg.includes("could not reach") && !msg.includes("failed to get")) {
          console.warn("Failed to fetch limits", err);
        } else {
          console.log("[usePlanLimits] Offline mode limits load fallback initialized.");
        }
        setLoading(false);
      }
    };

    fetchLimitsAndUsage();

    return () => {
      if (unsubscribeUser) unsubscribeUser();
    };
  }, [user]);

  // Methods to consume limits
  const checkLimit = (type: keyof PlanLimits, isPersonalApi: boolean) => {
    return true;
  };

  const consumeLimit = async (
    type: "pdf" | "chat",
    count: number,
    isPersonalApi: boolean,
  ) => {
    const dateId = new Date().toISOString().split("T")[0];
    let updateField = "";
    if (type === "pdf") {
      updateField = isPersonalApi ? "pdfPersonalApiCount" : "pdfSystemApiCount";
    } else {
      updateField = isPersonalApi
        ? "chatPersonalApiCount"
        : "chatSystemApiCount";
    }

    if (!user) {
      const localKey = `guest_usage_${dateId}`;
      try {
        const nextUsage = {
          ...usage,
          dateId,
          [updateField]:
            ((usage[updateField as keyof UserUsage] as number) || 0) + count,
        };
        localStorage.setItem(localKey, JSON.stringify(nextUsage));
        setUsage(nextUsage);
        return true;
      } catch (e) {
        console.error("Failed to persist guest usage", e);
        return false;
      }
    }

    const usageRef = doc(db, `users/${user.uid}/usage/${dateId}`);
    try {
      await setDoc(
        usageRef,
        {
          [updateField]: increment(count),
          dateId,
        },
        { merge: true },
      );

      setUsage((prev) => ({
        ...prev,
        [updateField]: (prev[updateField as keyof UserUsage] as number) + count,
      }));
      return true;
    } catch (err) {
      console.warn("Failed to write to usage tracking in Firestore, proceeding with local fallback:", err);
      // Soft fallbacks so users are never blocked as long as they have tokens
      setUsage((prev) => ({
        ...prev,
        [updateField]: ((prev[updateField as keyof UserUsage] as number) || 0) + count,
      }));
      return true;
    }
  };

  const consumeTokens = async (
    amount: number,
    description: string,
  ): Promise<boolean> => {
    if (!user) {
      const localGuestTokensKey = "guest_whiteboard_tokens";
      let gTokens = 50;
      const storedTokens = localStorage.getItem(localGuestTokensKey);
      if (storedTokens !== null) {
        gTokens = parseInt(storedTokens, 10);
      }

      if (gTokens < amount) {
        return false;
      }
      const nextTokens = gTokens - amount;
      localStorage.setItem(localGuestTokensKey, String(nextTokens));
      setTokens(nextTokens);

      // Dispatch event to render global notification in App Content UI
      window.dispatchEvent(
        new CustomEvent("whiteboard-token-deduction", {
          detail: {
            amount,
            remaining: nextTokens,
            description,
            guest: true,
          },
        }),
      );
      return true;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      let currentTokens = 500;

      if (userSnap.exists() && userSnap.data().tokens !== undefined) {
        currentTokens = Number(userSnap.data().tokens);
      }

      if (currentTokens < amount) {
        return false;
      }

      const nextTokens = currentTokens - amount;
      await setDoc(
        userRef,
        { tokens: nextTokens, uid: user.uid, email: user.email || "" },
        { merge: true },
      );
      setTokens(nextTokens);

      window.dispatchEvent(
        new CustomEvent("whiteboard-token-deduction", {
          detail: {
            amount,
            remaining: nextTokens,
            description,
            guest: false,
          },
        }),
      );
      return true;
    } catch (err) {
      console.error("Error consuming Whiteboard tokens:", err);
      return false;
    }
  };

  const addTokens = async (amount: number): Promise<boolean> => {
    if (!user) {
      const localGuestTokensKey = "guest_whiteboard_tokens";
      let gTokens = 50;
      const storedTokens = localStorage.getItem(localGuestTokensKey);
      if (storedTokens !== null) {
        gTokens = parseInt(storedTokens, 10);
      }
      const nextTokens = gTokens + amount;
      localStorage.setItem(localGuestTokensKey, String(nextTokens));
      setTokens(nextTokens);
      return true;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      let currentTokens = 50;
      if (userSnap.exists() && userSnap.data().tokens !== undefined) {
        currentTokens = Number(userSnap.data().tokens);
      }
      const nextTokens = currentTokens + amount;
      await setDoc(
        userRef,
        { tokens: nextTokens, uid: user.uid, email: user.email || "" },
        { merge: true },
      );
      setTokens(nextTokens);
      return true;
    } catch (err) {
      console.error("Failed to add Whiteboard tokens:", err);
      return false;
    }
  };

  return {
    limits,
    usage,
    loading,
    plan,
    tokens,
    checkLimit,
    consumeLimit,
    consumeTokens,
    addTokens,
    rates,
  };
};
