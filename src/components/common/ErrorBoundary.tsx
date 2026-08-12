import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-card">
          <div className="error-boundary-header">
            <AlertTriangle size={20} className="text-rose" />
            <span>{this.props.fallbackTitle || 'A rendering error occurred in this component'}</span>
          </div>
          <p className="error-boundary-msg">
            {this.state.error?.message || 'Unexpected exception'}
          </p>
          <button className="btn-secondary-sm" onClick={this.handleReset}>
            <RefreshCw size={13} />
            <span>Recover & Reset</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
