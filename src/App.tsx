import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AdminRoute } from '@/components/layout/AdminRoute'
import Login from '@/routes/login'
import ResetPassword from '@/routes/reset-password'
import MyProfile from '@/routes/my-profile'
import DashboardLayout from '@/routes/dashboard'
import Home from '@/routes/home'
import DashboardHome from '@/routes/dashboard-home'
import SelfEvaluation from '@/routes/self-evaluation'
import EvaluateList from '@/routes/evaluate-list'
import EvaluateDetail from '@/routes/evaluate-detail'
import Report from '@/routes/report'
import Settings from '@/routes/settings'
import EvaluationSettings from '@/routes/settings/evaluation'
import GeneralSettings from '@/routes/settings/general'

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
import InterviewSchedules from '@/routes/recruitment/schedules'

// OJT/수습
import OJTPrograms from '@/routes/ojt/programs'
import MentorManage from '@/routes/ojt/mentor'
import ProbationManage from '@/routes/ojt/probation'

// 월간 점검 / 동료 평가
import MonthlyCheckin from '@/routes/monthly-checkin'
import PeerReview from '@/routes/peer-review'

// 사내 메신저
import MessengerPage from '@/routes/messenger/index'

// 프로젝트 & 업무 (통합)
import UnifiedDashboard from '@/routes/projects/unified-dashboard'
import ProjectBoardPage from '@/routes/projects/index'
import ProjectDetailPage from '@/routes/projects/detail'
import NewProjectPage from '@/routes/projects/new'
import ProjectSettingsPage from '@/routes/projects/settings'

// 직원 확장
import EmployeeProfile from '@/routes/employees/profile'
import EmployeeSearch from '@/routes/employees/search'
import PersonalityAnalysis from '@/routes/employees/analysis'
import SpecialNotes from '@/routes/employees/notes'
import ExitManage from '@/routes/employees/exit'

// 업무관리 (통합 — 작업/보고서/챗봇만 유지)
import TaskManage from '@/routes/work/tasks'
import DailyReportPage from '@/routes/work/daily-report'
import WorkChatbot from '@/routes/work/chat'

// 인사평가 연동 (Phase 2)
import DataSync from '@/routes/work/data-sync'
import AIEvalReport from '@/routes/work/ai-eval-report'
import AIVerification from '@/routes/work/ai-verification'
import ExitManagement from '@/routes/work/exit-manage'

// Phase 1.5: 긴급 업무 + 평가 간소화
import UrgentDashboard from '@/routes/urgent/dashboard'
import SimpleEvaluation from '@/routes/urgent/simple-evaluation'
import PenaltiesDashboard from '@/routes/urgent/penalties'
import DataMigration from '@/routes/urgent/migration'

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
            {/* 로그인 / 비밀번호 설정 */}
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />

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
              {/* 홈 (랜딩 페이지) */}
              <Route index element={<Home />} />
              <Route path="eval-dashboard" element={<DashboardHome />} />
              <Route path="my-profile" element={<MyProfile />} />
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
              <Route
                path="settings/evaluation"
                element={
                  <AdminRoute>
                    <EvaluationSettings />
                  </AdminRoute>
                }
              />
              <Route
                path="settings/general"
                element={
                  <AdminRoute>
                    <GeneralSettings />
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
              <Route path="admin/recruitment/schedules" element={<AdminRoute><InterviewSchedules /></AdminRoute>} />
              <Route path="admin/recruitment/interview/:candidateId/face-to-face" element={<AdminRoute><FaceToFaceEval /></AdminRoute>} />

              {/* OJT/수습 (관리자/임원) */}
              <Route path="admin/ojt" element={<AdminRoute><OJTPrograms /></AdminRoute>} />
              <Route path="admin/ojt/mentor" element={<AdminRoute><MentorManage /></AdminRoute>} />
              <Route path="admin/probation" element={<AdminRoute><ProbationManage /></AdminRoute>} />

              {/* 월간 점검 / 동료 평가 */}
              <Route path="monthly-checkin" element={<MonthlyCheckin />} />
              <Route path="peer-review" element={<PeerReview />} />

              {/* 사내 메신저 */}
              <Route path="messenger" element={<MessengerPage />} />
              <Route path="messenger/:roomId" element={<MessengerPage />} />

              {/* 프로젝트 & 업무 (통합) */}
              <Route path="admin/projects" element={<UnifiedDashboard />} />
              <Route path="admin/projects/board" element={<ProjectBoardPage />} />
              <Route path="admin/projects/new" element={<NewProjectPage />} />
              <Route path="admin/projects/settings" element={<AdminRoute><ProjectSettingsPage /></AdminRoute>} />
              <Route path="admin/projects/:id" element={<ProjectDetailPage />} />

              {/* 직원관리 확장 (관리자/임원) */}
              <Route path="admin/employees/:id/profile" element={<AdminRoute><EmployeeProfile /></AdminRoute>} />
              <Route path="admin/employees/search" element={<AdminRoute><EmployeeSearch /></AdminRoute>} />
              <Route path="admin/employees/analysis" element={<AdminRoute><PersonalityAnalysis /></AdminRoute>} />
              <Route path="admin/employees/notes" element={<AdminRoute><SpecialNotes /></AdminRoute>} />
              <Route path="admin/employees/exit" element={<AdminRoute><ExitManage /></AdminRoute>} />

              {/* Phase 1.5: 긴급 업무 + 평가 간소화 */}
              <Route path="admin/urgent" element={<AdminRoute><UrgentDashboard /></AdminRoute>} />
              <Route path="urgent" element={<UrgentDashboard />} />
              <Route path="admin/urgent/simple-eval" element={<AdminRoute><SimpleEvaluation /></AdminRoute>} />
              <Route path="admin/urgent/penalties" element={<AdminRoute><PenaltiesDashboard /></AdminRoute>} />
              <Route path="admin/urgent/migration" element={<AdminRoute><DataMigration /></AdminRoute>} />

              {/* 작업관리 (통합 메뉴에서 접근) */}
              <Route path="admin/work/tasks" element={<TaskManage />} />
              <Route path="work/daily-report" element={<DailyReportPage />} />
              <Route path="work/chat" element={<WorkChatbot />} />

              {/* 인사평가 연동 (Phase 2) */}
              <Route path="admin/hr/sync" element={<AdminRoute><DataSync /></AdminRoute>} />
              <Route path="admin/hr/ai-report" element={<AdminRoute><AIEvalReport /></AdminRoute>} />
              <Route path="admin/hr/verification" element={<AdminRoute><AIVerification /></AdminRoute>} />
              <Route path="admin/hr/exit" element={<AdminRoute><ExitManagement /></AdminRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
