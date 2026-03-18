import { ShieldX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function AccessDenied() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <ShieldX className="w-16 h-16 text-red-400 mb-4" />
      <h1 className="text-xl font-semibold text-slate-800 mb-2">Access Denied</h1>
      <p className="text-sm text-slate-500 mb-6 text-center max-w-sm">
        You don't have permission to view this page. Contact your administrator to request access.
      </p>
      <button
        onClick={() => navigate('/')}
        className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
      >
        Go to Home
      </button>
    </div>
  )
}
