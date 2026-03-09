import { Navigate } from "react-router-dom";
import { useAccounts } from "../hooks";

export default function HomePage() {
  const { data: accounts = [], isLoading } = useAccounts();

  if (isLoading) {
    return null;
  }

  return <Navigate to={accounts.length > 0 ? "/portfolio" : "/accounts"} replace />;
}
