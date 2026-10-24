import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/AppShell";
import EscalationListener from "@/components/EscalationListener";
import Login from "@/pages/Login";
import Overview from "@/pages/cc/Overview";
import MineIntelligence from "@/pages/cc/MineIntelligence";
import FieldInspections from "@/pages/cc/FieldInspections";
import ComplianceRegister from "@/pages/cc/ComplianceRegister";
import Contractors from "@/pages/cc/Contractors";
import CorrectiveActions from "@/pages/cc/CorrectiveActions";
import Environment from "@/pages/cc/Environment";
import ReportsAudit from "@/pages/cc/ReportsAudit";
import ReportsBuilder from "@/pages/cc/ReportsBuilder";
import Grievances from "@/pages/cc/Grievances";
import Assistant from "@/pages/cc/Assistant";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AppShell />}>
          <Route index element={<Overview />} />
          <Route path="mines" element={<MineIntelligence />} />
          <Route path="inspections" element={<FieldInspections />} />
          <Route path="compliance" element={<ComplianceRegister />} />
          <Route path="contractors" element={<Contractors />} />
          <Route path="corrective-actions" element={<CorrectiveActions />} />
          <Route path="environment" element={<Environment />} />
          <Route path="grievances" element={<Grievances />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="reports" element={<ReportsAudit />} />
          <Route path="reports/builder" element={<ReportsBuilder />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
      <EscalationListener />
    </>
  );
}