import { Component, type ReactNode } from 'react';
import { ErrorMessage } from '../../components/feedback/ErrorMessage';

interface Props {
  title: string;
  children: ReactNode;
}

/**
 * Catches anything a single block throws while rendering (a payload shape nobody expected, a bug in one renderer) so the rest of the
 * homepage keeps working. Network and HTTP errors never get here: each block already shows those as its own error state.
 */
export class BlockBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[home] the "${this.props.title}" block failed to render`, error);
  }

  render() {
    if (this.state.failed) {
      return (
        <ErrorMessage
          title={`${this.props.title} could not be shown`}
          minHeight={160}
          onRetry={() => this.setState({ failed: false })}
        />
      );
    }
    return this.props.children;
  }
}
