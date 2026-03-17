import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AdminRoute } from '@/components/layout/AdminRoute'
import Login from '@/routes/login'
import DashboardLayout from '@/routes/dashboard'
import DashboardHome from '@/routes/dashboard-home'
import SelfEvaluation from '@/routes/self-evaluation'
import EvaluateList from '@/routes/evaluate-list'
import EvaluateDetail from '@/routes/evaluate-detail'
import Report from '@/routes/report'
import Settings from '@/routes/settings'

// 채용관리
import RecruitmentDashboard from '@/routes/recruitment/dashboard'
import RecruitmentJobs from '@/routes/recruitment/jobs'
import RecruitmentJobNew from '@/routes/recruitment/job-new'
import RecruitmentJobDetail from '@/routes/recruitment/job-detail'
import CandidateReport from '@/routes/recruitment/candidate-report'
import SurveyManage from '@/routes/recruitment/survey-manage'
import TalentProfiles from '@/routes/recruitment/talent'
import AITrustDashboard from '@/routes/recruitment/trust'
import FaceToFaceEval from '@/routes/recruitment/face-to-face'

// OJT/수습
import OJTPrograms from '@/routes/ojt/programs'
import MentorManage from '@/routes/ojt/mentor'
import ProbationManage from '@/routes/ojt/probation'

// 직원 확장
import EmployeeProfile from '@/routes/employees/profile'
import EmployeeSearch from '@/routes/employees/search'
import PersonalityAnalysis from '@/routes/employees/analysis'
import SpecialNotes from '@/routes/employees/notes'
import ExitManage from '@/routes/employees/exit'

// 외부 페이지 (로그인 불필요)
import PublicApply from '@/routes/public/apply'
import PublicSurvey from '@/routes/public/survey'
import PublicInterview from '@/routes/public/interview'
import PublicExitSurvey from '@/routes/public/exit-survey'

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* 로그인 */}
            <Route path="/login" element={<Login />} />

            {/* 외부 페이지 (로그인 불필요) */}
            <Route path="/apply/:postingId" element={<PublicApply />} />
            <Route path="/survey/:token" element={<PublicSurvey />} />
            <Route path="/interview/:token" element={<PublicInterview />} />
            <Route path="/exit-survey/:token" element={<PublicExitSurvey />} />

            {/* 인증 필요 영역 */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              {/* 기존 라우트 */}
              <Route index element={<DashboardHome />} />
              <Route path="self-evaluation" element={<SelfEvaluation />} />
              <Route path="evaluate" element={<EvaluateList />} />
              <Route path="evaluate/:employeeId" element={<EvaluateDetail />} />
              <Route path="report" element={<Report />} />
              <Route path="report/:employeeId" element={<Report />} />
              <Route
                path="settings"
                element={
                  <AdminRoute>
                    <Settings />
                  </AdminRoute>
                }
              />

              {/* 채용관리 (관리자/임원) */}
              <Route path="admin/recruitment" element={<AdminRoute><RecruitmentDashboard /></AdminRoute>} />
              <Route path="admin/recruitment/jobs" element={<AdminRoute><RecruitmentJobs /></AdminRoute>} />
              <Route path="admin/recruitment/jobs/new" element={<AdminRoute><RecruitmentJobNew /></AdminRoute>} />
              <Route path="admin/recruitment/jobs/:id" element={<AdminRoute><RecruitmentJobDetail /></AdminRoute>} />
              <Route path="admin/recruitment/candidates/:id" element={<AdminRoute><CandidateReport /></AdminRoute>} />
              <Route path="admin/recruitment/survey" element={<AdminRoute><SurveyManage /></AdminRoute>} />
              <Route path="admin/recruitment/talent" element={<AdminRoute><TalentProfiles /></AdminRoute>} />
              <Route path="admin/recruitment/trust" element={<AdminRoute><AITrustDashboard /></AdminRoute>} />
              <Route path="admin/recruitment/interview/:candidateId/face-to-face" element={<AdminRoute><FaceToFaceEval /></AdminRoute>} />

              {/* OJT/수습 (관리자/임원) */}
              <Route path="admin/ojt" element={<AdminRoute><OJTPrograms /></AdminRoute>} />
              <Route path="admin/ojt/mentor" element={<AdminRoute><MentorManage /></AdminRoute>} />
              <Route path="admin/probation" element={<AdminRoute><ProbationManage /></AdminRoute>} />

              {/* 직원관리 확장 (관리자/임원) */}
              <Route path="admin/employees/:id/profile" element={<AdminRoute><EmployeeProfile /></AdminRoute>} />
              <Route path="admin/employees/search" element={<AdminRoute><EmployeeSearch /></AdminRoute>} />
              <Route path="admin/employees/analysis" element={<AdminRoute><PersonalityAnalysis /></AdminRoute>} />
              <Route path="admin/employees/notes" element={<AdminRoute><SpecialNotes /></AdminRoute>} />
              <Route path="admin/employees/exit" element={<AdminRoute><ExitManage /></AdminRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
