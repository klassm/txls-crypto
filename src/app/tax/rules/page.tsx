import { Metadata } from "next";
import { TaxRulesContent } from "./TaxRulesContent";

export const metadata: Metadata = {
  title: "German Crypto Tax Rules | TXLS",
  description: "Understanding German cryptocurrency taxation rules and regulations",
};

export default function TaxRulesPage() {
  return <TaxRulesContent />;
}
