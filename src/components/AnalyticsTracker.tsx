import React, { useEffect } from "react";
import { db } from "../services/firebase";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

const AnalyticsTracker: React.FC = () => {
  useEffect(() => {
    const initializeAnalytics = async () => {
      try {
        // 1. Fetch Admin Settings for Google Analytics
        const settingsRef = doc(db, "settings", "analytics");
        const settingsSnap = await getDoc(settingsRef);

        let gaId = null;
        if (settingsSnap.exists()) {
          gaId = settingsSnap.data().googleAnalyticsId;
        }

        if (gaId) {
          // Inject Google Analytics Scripts
          const script1 = document.createElement("script");
          script1.async = true;
          script1.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
          document.head.appendChild(script1);

          const script2 = document.createElement("script");
          script2.innerHTML = `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaId}');
          `;
          document.head.appendChild(script2);
        }

        // 2. Internal Simple Tracker to show on Admin Panel
        const lastVisitDate = sessionStorage.getItem("internal_visit_tracked");
        if (!lastVisitDate) {
          // Track this new session
          let ipData: any = {};
          try {
            const ipReq = await fetch("/api/geolocation");
            if (ipReq.ok) {
              const res = await ipReq.json();
              ipData = {
                ipAddress: res.ip,
                cityName: res.city,
                countryName: res.country_name,
                regionName: res.region,
              };
            }
          } catch (fetchErr) {
            console.warn(
              "Analytics lookup: /api/geolocation skipped. Falling back to direct layout tracking...",
              fetchErr
            );
          }

          await addDoc(collection(db, "analytics"), {
            timestamp: serverTimestamp(),
            userAgent: navigator.userAgent,
            ip: ipData.ipAddress || "Unknown",
            city: ipData.cityName || "Unknown",
            country: ipData.countryName || "Unknown",
            region: ipData.regionName || "Unknown",
            browserLocale: navigator.language,
          });
          sessionStorage.setItem("internal_visit_tracked", "true");
        }
      } catch (err: any) {
        if (!err.message?.includes("offline")) {
          console.warn("Failed to initialize tracking", err);
        }
      }
    };

    initializeAnalytics();
  }, []);

  return null;
};

export default AnalyticsTracker;
