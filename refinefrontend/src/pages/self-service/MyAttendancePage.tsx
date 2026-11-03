import { Navigate } from "react-router";

/** WFH requests now live on the Requests page; keeps old links and the "My WFH" menu entry working. */
export default function MyAttendancePage() {
  return <Navigate to="/my-leaves?tab=wfh" replace />;
}
