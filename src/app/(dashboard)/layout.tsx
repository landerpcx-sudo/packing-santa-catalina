import Sidebar from '@/components/layout/Sidebar'
import PageWrapper from '@/components/layout/PageWrapper'
import BottomNav from '@/components/layout/BottomNav'
import Confetti from '@/components/layout/Confetti'
import UploadQueueIndicator from '@/components/layout/UploadQueueIndicator'
import { GlobalSearchProvider } from '@/components/layout/GlobalSearch'
import { UploadQueueProvider } from '@/context/UploadQueueContext'
import { ReactNode } from 'react'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <UploadQueueProvider>
      <GlobalSearchProvider>
        <div
          className="min-h-screen flex transition-colors duration-300 vignette"
          style={{ backgroundColor: 'var(--bg-app)' }}
        >
          <Sidebar />
          <main className="flex-1 min-w-0 lg:ml-0 relative">
            <div className="p-4 lg:p-8 pt-16 lg:pt-8 pb-24 lg:pb-8">
              <PageWrapper>
                {children}
              </PageWrapper>
            </div>
          </main>
          <BottomNav />
          <Confetti />
          <UploadQueueIndicator />
        </div>
      </GlobalSearchProvider>
    </UploadQueueProvider>
  )
}
