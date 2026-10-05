import React from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/admin';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4 shadow-sm">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Something went wrong loading this section
          </h2>
          <p className="text-sm text-gray-500 max-w-md mb-4">
            An unexpected error occurred while rendering this page component.
          </p>
          {this.state.error?.message && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg max-w-lg mb-6 font-mono text-left overflow-x-auto">
              {this.state.error.message}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload Page
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs font-semibold"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
