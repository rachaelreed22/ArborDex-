import { useNavigate } from 'react-router-dom';
import './HomeownerTheme.css';

export default function HomeownerDemoGarden() {
  const navigate = useNavigate();

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-3xl rounded-2xl p-8 shadow-2xl">
        <h1 className="homeowner-heading text-3xl font-bold">Demo Digital Garden</h1>
        <p className="homeowner-subtext mt-3 text-sm">
          This is the preview route for your Demo Digital Garden. Full demo experience will be added in the next phase.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="homeowner-button-primary rounded-md px-5 py-2.5 text-sm font-semibold"
            onClick={() => navigate('/homeowners/signup')}
          >
            Create My Digital Garden
          </button>
          <button
            type="button"
            className="homeowner-button-secondary rounded-md px-5 py-2.5 text-sm font-semibold"
            onClick={() => navigate('/homeowners')}
          >
            Back
          </button>
        </div>
      </div>
    </main>
  );
}
