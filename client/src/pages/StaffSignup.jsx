import { Link } from 'react-router-dom';

export default function StaffSignup() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#1d411d] to-[#2e5e2e] px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-[#4c844c]/40 bg-white/95 p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-[#1d411d]">Staff Signup</h1>
        <p className="mt-3 text-sm text-[#355235]">
          Staff accounts are provisioned by your ArborTag administrator. If you need access,
          contact your park administrator or the Queen account owner.
        </p>
        <p className="mt-5 text-sm text-[#355235]">
          <Link className="font-semibold underline" to="/staff/login">Go to staff login</Link>
        </p>
      </div>
    </main>
  );
}
