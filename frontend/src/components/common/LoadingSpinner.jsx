export default function LoadingSpinner({ size = 'md', message }) {
  const s = { sm: 'w-6 h-6', md: 'w-10 h-10', lg: 'w-16 h-16' }[size];
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className={`${s} rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin`} />
      {message && <p className="text-sm text-gray-500">{message}</p>}
    </div>
  );
}
