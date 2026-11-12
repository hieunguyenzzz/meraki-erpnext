import { Navigate, useLocation } from "react-router";

/** WFH requests now live on the Requests page; keeps old links working and any query or hash. */
export default function MyAttendancePage() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", "wfh");
  return <Navigate to={`/my-leaves?${params.toString()}${hash}`} replace />;
}
