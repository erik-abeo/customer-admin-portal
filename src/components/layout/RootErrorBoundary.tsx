import { Alert, Button, Center, Container, Stack } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches synchronous render errors anywhere in the tree (including outside
 * of React Router). Router-driven errors still flow into the per-route
 * ErrorBoundary so the chrome stays visible for those.
 */
export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfacing the component stack helps when nothing else has rendered yet.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Center mih="60vh">
        <Container size="sm">
          <Stack gap="md">
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertTriangle size={18} />}
              title="The portal failed to render"
            >
              {this.state.error.message}
            </Alert>
            <Button onClick={this.handleReload} variant="default">
              Reload
            </Button>
          </Stack>
        </Container>
      </Center>
    );
  }
}
