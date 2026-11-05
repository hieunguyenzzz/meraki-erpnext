import { useEffect } from "react";
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
import { ThemeProvider } from "@/context/theme-context";
import { InquiryForm } from "./inquiry/InquiryForm";

const RECAPTCHA_SITE_KEY = "6LddGHQsAAAAAFhiFECWxyGeM_2Skr9VZA8XYCzn";

// Public, couple-facing page (no login, no app shell). Form lives in ./inquiry/.
export default function InquiryPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Wedding Inquiry | Meraki Wedding Planner";

    let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    const prevDesc = metaDesc.getAttribute("content") ?? "";
    metaDesc.setAttribute(
      "content",
      "Tell us about your love story and the wedding day you've been dreaming of. Meraki Wedding Planner will craft an unforgettable experience tailored just for you."
    );

    return () => {
      document.title = prevTitle;
      metaDesc!.setAttribute("content", prevDesc);
    };
  }, []);

  return (
    <ThemeProvider>
      <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
        <InquiryForm />
      </GoogleReCaptchaProvider>
    </ThemeProvider>
  );
}
