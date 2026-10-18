import { Link } from 'react-router';
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-mute">That page doesn't exist.</p>
      <Link to="/dashboard" className="btn-secondary mt-6">Go to dashboard</Link>
    </div>
  );
}
