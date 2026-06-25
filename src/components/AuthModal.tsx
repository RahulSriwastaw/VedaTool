import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Mail,
  Phone,
  ArrowLeft,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { auth, db } from "../services/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { signInWithGoogle } from "../services/googleAuth";
import { getCleanDisplayName } from "../types";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<"options" | "email" | "phone">("options");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthNotAllowedError, setIsAuthNotAllowedError] = useState(false);

  const resetFields = () => {
    setMode("options");
    setEmail("");
    setPassword("");
    setFullName("");
    setPhone("");
    setOtpSent(false);
    setVerificationCode("");
    setError(null);
    setIsAuthNotAllowedError(false);
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Error signing in with Google:", err);
      const code = err?.code || "";
      if (code === "auth/unauthorized-domain") {
        setError(
          "This domain is not authorized in Firebase. Add localhost to Authorized domains in the Firebase Console (Authentication → Settings).",
        );
      } else {
        setError(err?.message || "Google registration failed. Please try again.");
      }
      setLoading(false);
    }
  };

  const handleEmailAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all email fields.");
      return;
    }
    if (isSignUp && (!fullName || !fullName.trim())) {
      setError("Please enter your full name.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isSignUp) {
        const uCred = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const signedUpUser = uCred.user;
        if (signedUpUser) {
          await updateProfile(signedUpUser, {
            displayName: fullName.trim(),
          });
          await setDoc(
            doc(db, "users", signedUpUser.uid),
            {
              uid: signedUpUser.uid,
              email: signedUpUser.email || "",
              displayName: fullName.trim(),
              tokens: 50,
              lastMonthlyCreditMonth: new Date().toISOString().substring(0, 7),
            },
            { merge: true },
          );
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
      resetFields();
    } catch (err: any) {
      console.error("Email auth error info: ", err);
      if (
        err?.code === "auth/operation-not-allowed" ||
        (err?.message && err.message.includes("auth/operation-not-allowed"))
      ) {
        setIsAuthNotAllowedError(true);
        setError(null);
      } else if (
        err?.code === "auth/invalid-credential" ||
        (err?.message && err.message.includes("auth/invalid-credential"))
      ) {
        setError(
          "Incorrect email or password. Please double check your credentials or switch to Sign Up if you don't have an account.",
        );
      } else if (
        err?.code === "auth/user-not-found" ||
        (err?.message && err.message.includes("auth/user-not-found"))
      ) {
        setError(
          "No account found with this email. Please switch to Sign Up first.",
        );
      } else if (
        err?.code === "auth/wrong-password" ||
        (err?.message && err.message.includes("auth/wrong-password"))
      ) {
        setError("Incorrect password. Please try again.");
      } else {
        setError(err?.message || "Authentication process failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
      setError("Please enter a valid phone number.");
      return;
    }
    setLoading(true);
    setError(null);
    setTimeout(() => {
      setOtpSent(true);
      setLoading(false);
    }, 1000);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode) {
      setError("Please enter the 6-digit verification code.");
      return;
    }
    setLoading(true);
    // Mimic phone authentication successfully
    setTimeout(() => {
      onClose();
      resetFields();
    }, 1200);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop screen filter */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[100]"
            onClick={() => {
              onClose();
              resetFields();
            }}
          />

          <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-[101] p-1">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="w-full max-w-md bg-[#1A1A1A] card rounded-2xl relative pointer-events-auto overflow-hidden border border-[#252525]"
            >
              {/* Grid Background Pattern inside the Auth card to match requested style screenshot */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />

              {/* Close target */}
              <button
                onClick={() => {
                  onClose();
                  resetFields();
                }}
                className="absolute top-4 right-4 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--bg-hover)] transition-colors z-10 cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="p-3 relative">
                {isAuthNotAllowedError ? (
                  <div className="flex flex-col text-left">
                    <button
                      onClick={() => {
                        setIsAuthNotAllowedError(false);
                        setMode("email");
                        setError(null);
                      }}
                      className="flex items-center gap-2 text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-2 cursor-pointer bg-transparent border-none mt-0 self-start"
                    >
                      <ArrowLeft size={14} /> Back to Email Login
                    </button>

                    <div className="flex items-center gap-2 mb-1 text-amber-500">
                      <Sparkles size={20} className="animate-pulse shrink-0" />
                      <h3 className="text-[15px] font-bold font-sans text-[var(--text-primary)] leading-snug">
                        Enable Email & Password
                      </h3>
                    </div>

                    <p className="text-[11px] text-[var(--text-secondary)] mb-2 leading-relaxed">
                      Email & Password registration is currently disabled on
                      your Firebase project. Follow these quick steps to enable
                      it:
                    </p>

                    <div className="space-y-3 mb-2">
                      <div className="flex gap-2.5 items-start">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--bg-hover)] text-[10px] font-bold text-[var(--text-primary)] shrink-0 mt-1">
                          1
                        </span>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-semibold text-pretty">
                          Open your Firebase Console project using the link
                          below.
                        </p>
                      </div>
                      <div className="flex gap-2.5 items-start">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--bg-hover)] text-[10px] font-bold text-[var(--text-primary)] shrink-0 mt-1">
                          2
                        </span>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-semibold text-pretty">
                          Navigate to <strong>Authentication</strong> &rarr;{" "}
                          <strong>Sign-in method</strong>.
                        </p>
                      </div>
                      <div className="flex gap-2.5 items-start">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--bg-hover)] text-[10px] font-bold text-[var(--text-primary)] shrink-0 mt-1">
                          3
                        </span>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-semibold text-pretty">
                          Click <strong>Add new provider</strong>, choose{" "}
                          <strong>Email/Password</strong>, toggle{" "}
                          <strong>Enable</strong>, and click{" "}
                          <strong>Save</strong>.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <a
                        href={`https://console.firebase.google.com/project/${auth.app?.options?.projectId || "gen-lang-client-0456544065"}/authentication/providers`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full text-center font-bold text-[13px] py-1 px-1 rounded-xl text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] transition-all flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(255,107,43,0.25)]"
                      >
                        Open Firebase Console &rarr;
                      </a>

                      <button
                        onClick={() => {
                          setIsAuthNotAllowedError(false);
                          setMode("options");
                        }}
                        className="w-full font-bold text-[11px] py-1 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-strong)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer mt-1"
                      >
                        Try Google Sign-In Instead
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="mb-1 p-1 bg-[var(--error-bg)] border border-[var(--error-border)] rounded-lg text-[11px] font-semibold text-[var(--error-text)] leading-relaxed">
                        {error}
                      </div>
                    )}

                    {mode === "options" && (
                      <div className="flex flex-col items-center text-center">
                        <h2 className="text-[24px] font-bold text-[var(--text-primary)] font-sans tracking-tight mb-1">
                          Get Started Free
                        </h2>
                        <p className="text-[14px] text-[var(--text-secondary)] font-medium mb-3">
                          50 free credits • No credit card required
                        </p>

                        {/* Google Action Primary Accent Button matching your layout diagram */}
                        <button
                          onClick={handleGoogleSignIn}
                          disabled={loading}
                          className="w-full flex items-center justify-center gap-3 text-[#EFEFEF] bg-[#FF6B2B] hover:bg-[#E55A1A] font-semibold py-1 px-2 rounded-xl transition-all shadow-[0_4px_12px_rgba(255,107,43,0.25)] hover:shadow-[0_6px_16px_rgba(255,107,43,0.35)] active:scale-[0.98] disabled:opacity-50 text-[14px] cursor-pointer border-none"
                        >
                          {loading ? (
                            <Loader2 className="animate-spin" size={18} />
                          ) : (
                            <svg
                              className="w-5 h-5"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <rect
                                width="24"
                                height="24"
                                rx="12"
                                fill="white"
                              />
                              <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M17.64 12.23C17.64 11.62 17.58 11.04 17.48 10.48H12V13.81H15.17C15.03 14.53 14.62 15.14 14.01 15.55V17.72H16.86C18.53 16.19 19.5 13.92 19.5 11.23C19.5 11.58 17.64 12.23 17.64 12.23Z"
                                fill="#4285F4"
                              />
                              <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M12 19C13.89 19 15.48 18.37 16.63 17.29L13.78 15.12C12.99 15.65 11.99 15.97 12 15.97C10.18 15.97 8.64 14.74 8.09 13.09H1.14V15.31C2.29 17.59 4.64 19 12 19Z"
                                fill="#34A853"
                              />
                              <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M8.09 13.09C7.95 12.67 7.87 12.22 7.87 11.75C7.87 11.28 7.95 10.83 8.09 10.41V8.19H1.14C0.41 9.61 0 11.21 0 12.91C0 14.61 0.41 16.21 1.14 17.63L8.09 13.09Z"
                                fill="#FBBC05"
                              />
                              <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M12 7.51C13.03 7.51 13.95 7.86 14.68 8.55L17.56 5.67C15.81 4.04 13.56 3.03 12 3.03C8.25 3.03 4.9 5.16 3.23 8.19L8.09 10.41C8.64 8.76 10.18 7.51 12 7.51Z"
                                fill="#EA4335"
                              />
                            </svg>
                          )}
                          Continue with Google
                        </button>

                        {/* Or Continue Divider matching your design spec */}
                        <div className="w-full flex items-center justify-center my-2 gap-3">
                          <div className="h-[1px] bg-[var(--border-default)] flex-1" />
                          <span className="text-[10px] tracking-wider font-extrabold text-[var(--text-secondary)] uppercase select-none">
                            OR CONTINUE WITH
                          </span>
                          <div className="h-[1px] bg-[var(--border-default)] flex-1" />
                        </div>

                        {/* Secondary Custom Actions list */}
                        <div className="w-full flex flex-col gap-3">
                          <button
                            onClick={() => setMode("phone")}
                            className="w-full flex items-center justify-center gap-3 bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-primary)] hover:text-[var(--brand-primary)] font-semibold py-1 px-2 border border-[var(--border-strong)] rounded-xl transition-all  active:scale-[0.98] text-[14px] cursor-pointer"
                          >
                            <Phone size={17} className="text-[var(--brand-primary)]" />
                            Continue with Phone
                          </button>

                          <button
                            onClick={() => setMode("email")}
                            className="w-full flex items-center justify-center gap-3 bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-primary)] hover:text-[var(--brand-primary)] font-semibold py-1 px-2 border border-[var(--border-strong)] rounded-xl transition-all  active:scale-[0.98] text-[14px] cursor-pointer"
                          >
                            <Mail size={17} className="text-[#FF6B2B]" />
                            Continue with Email
                          </button>
                        </div>

                        {/* Static footer message */}
                        <p className="mt-3 text-[11px] text-[var(--text-secondary)] leading-relaxed font-sans max-w-xs px-1">
                          By signing in, you agree to our{" "}
                          <a
                            href="#terms"
                            className="text-[var(--brand-primary)] font-semibold hover:underline"
                          >
                            Terms of Service
                          </a>{" "}
                          and{" "}
                          <a
                            href="#privacy"
                            className="text-[var(--brand-primary)] font-semibold hover:underline"
                          >
                            Privacy Policy
                          </a>
                        </p>
                      </div>
                    )}

                    {mode === "email" && (
                      <div>
                        <button
                          onClick={() => {
                            setMode("options");
                            setError(null);
                          }}
                          className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-2 cursor-pointer bg-transparent border-none"
                        >
                          <ArrowLeft size={14} /> Back to options
                        </button>

                        <h3 className="text-[20px] font-bold text-[var(--text-primary)] mb-1 font-sans">
                          {isSignUp ? "Create Your Account" : "Welcome Back"}
                        </h3>
                        <p className="text-[11px] text-[var(--text-secondary)] mb-2">
                          {isSignUp
                            ? "Sign up to start your credit balance"
                            : "Sign in to resume document processing"}
                        </p>

                        <form
                          onSubmit={handleEmailAction}
                          className="space-y-4"
                        >
                          {isSignUp && (
                            <div>
                              <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-sans">
                                Full Name
                              </label>
                              <input
                                type="text"
                                required
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Your Real Name"
                                className="w-full px-1 py-1 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] text-[var(--text-primary)] text-[13px] transition-all font-sans font-medium"
                              />
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-sans">
                              Email Address
                            </label>
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="name@company.com"
                              className="w-full px-1 py-1 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] text-[var(--text-primary)] text-[13px] transition-all font-sans font-medium"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-sans">
                              Password
                            </label>
                            <div className="relative">
                              <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-1 pr-4 py-1 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] text-[var(--text-primary)] text-[13px] transition-all font-sans font-medium"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute top-1/2 -translate-y-1/2 right-3.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors bg-transparent border-none cursor-pointer"
                              >
                                {showPassword ? (
                                  <EyeOff size={16} />
                                ) : (
                                  <Eye size={16} />
                                )}
                              </button>
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] font-semibold py-1 px-1 rounded-xl cursor-pointer transition-all text-[13px] border-none"
                          >
                            {loading ? (
                              <Loader2 className="animate-spin" size={16} />
                            ) : isSignUp ? (
                              "Sign Up"
                            ) : (
                              "Continue with Email"
                            )}
                          </button>
                        </form>

                        <p className="mt-2 text-center text-[11px] text-[var(--text-secondary)] font-sans">
                          {isSignUp
                            ? "Already have an account?"
                            : "New to Veda?"}{" "}
                          <button
                            onClick={() => {
                              setIsSignUp(!isSignUp);
                              setError(null);
                            }}
                            className="text-[var(--brand-primary)] font-semibold hover:underline hover:opacity-90 ml-1 bg-transparent border-none cursor-pointer"
                          >
                            {isSignUp ? "Sign In" : "Create Account"}
                          </button>
                        </p>
                      </div>
                    )}

                    {mode === "phone" && (
                      <div>
                        <button
                          onClick={() => {
                            setMode("options");
                            setError(null);
                          }}
                          className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-2 cursor-pointer bg-transparent border-none"
                        >
                          <ArrowLeft size={14} /> Back to options
                        </button>

                        <h3 className="text-[20px] font-bold text-[var(--text-primary)] mb-1 font-sans">
                          Continue with Phone
                        </h3>
                        <p className="text-[11px] text-[var(--text-secondary)] mb-2">
                          {!otpSent
                            ? "Verify your identity with secure SMS codes"
                            : "Verify the OTP verification code"}
                        </p>

                        {!otpSent ? (
                          <form onSubmit={handleSendOtp} className="space-y-4">
                            <div>
                              <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-sans">
                                Phone Number
                              </label>
                              <input
                                type="tel"
                                required
                                placeholder="+1 (555) 000-0000"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full px-1 py-1 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] text-[var(--text-primary)] text-[13px] transition-all font-sans font-medium"
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full flex items-center justify-center gap-2 text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] font-semibold py-1 px-1 rounded-xl cursor-pointer transition-all text-[13px] border-none"
                            >
                              {loading ? (
                                <Loader2 className="animate-spin" size={16} />
                              ) : (
                                "Send Verification Code"
                              )}
                            </button>
                          </form>
                        ) : (
                          <form
                            onSubmit={handleVerifyOtp}
                            className="space-y-4"
                          >
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider font-sans">
                                  Verification OTP Code
                                </label>
                                <span className="text-[10px] text-[var(--success-text)] bg-[var(--success-bg)] border border-[var(--success-border)] px-1 py-1 rounded-[4px] font-bold animate-pulse">
                                  Simulated SMS Sent: 123456
                                </span>
                              </div>
                              <input
                                type="text"
                                required
                                maxLength={6}
                                placeholder="Type Code"
                                value={verificationCode}
                                onChange={(e) =>
                                  setVerificationCode(e.target.value)
                                }
                                className="w-full px-1 py-1 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] text-[var(--text-primary)] text-center tracking-[4px] font-bold text-[15px] transition-all font-sans"
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full flex items-center justify-center gap-2 text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] font-semibold py-1 px-1 rounded-xl cursor-pointer transition-all text-[13px] border-none"
                            >
                              {loading ? (
                                <Loader2 className="animate-spin" size={16} />
                              ) : (
                                "Verify and Continue"
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => setOtpSent(false)}
                              className="w-full text-center text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--brand-primary)] cursor-pointer mt-1 bg-transparent transition-colors border-none"
                            >
                              Resend Code
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
