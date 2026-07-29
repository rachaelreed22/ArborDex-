import { useNavigate } from 'react-router-dom';
import { saveOnboardingDraftSnapshot } from '../utils/sessionGardenMigration';

export default function OnboardingTopNav({ showSave = true }) {
  const navigate = useNavigate();

  return (
    <header className="onboarding-top-nav">
      <div className="onboarding-top-nav-spacer" />
      <div className="onboarding-top-nav-actions">
        <button type="button" className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold" onClick={() => navigate('/')}>
          Home
        </button>
        <button type="button" className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold" onClick={() => navigate('/help')}>
          Help / FAQ
        </button>
        <button type="button" className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold" onClick={() => navigate('/homeowners/login')}>
          Sign In
        </button>
        {showSave && (
          <button
            type="button"
            className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold"
            onClick={() => {
              saveOnboardingDraftSnapshot();
              navigate('/homeowners/signup');
            }}
          >
            Save Your Garden
          </button>
        )}
      </div>
    </header>
  );
}
