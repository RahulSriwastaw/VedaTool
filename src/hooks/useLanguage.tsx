import React, { createContext, useContext, useState, useEffect } from "react";

export type LanguageLocale = "EN" | "HI" | "BOTH";

interface LanguageContextType {
  language: LanguageLocale;
  setLanguage: (lang: LanguageLocale) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageLocale>(() => {
    return (localStorage.getItem("mcq_view_language") as LanguageLocale) || "BOTH";
  });

  const setLanguage = (lang: LanguageLocale) => {
    setLanguageState(lang);
    localStorage.setItem("mcq_view_language", lang);
  };

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "mcq_view_language" && e.newValue) {
        setLanguageState(e.newValue as LanguageLocale);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
