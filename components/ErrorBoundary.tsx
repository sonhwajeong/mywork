import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 Error Boundary caught an error:', error);
    console.error('🚨 Error Info:', errorInfo);
    
    // 더 자세한 에러 정보를 logcat에 출력
    console.error('🚨 Component Stack:', errorInfo.componentStack);
    console.error('🚨 Error Stack:', error.stack);
    console.error('🚨 Error Message:', error.message);
    console.error('🚨 Error Name:', error.name);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <ScrollView style={styles.scrollView}>
            <Text style={styles.title}>앱에서 오류가 발생했습니다</Text>
            <Text style={styles.subtitle}>개발자 도구에서 자세한 내용을 확인할 수 있습니다.</Text>
            
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>Error Details:</Text>
              <Text style={styles.errorText}>
                {this.state.error?.name}: {this.state.error?.message}
              </Text>
              
              {this.state.error?.stack && (
                <>
                  <Text style={styles.errorTitle}>Stack Trace:</Text>
                  <Text style={styles.stackText}>{this.state.error.stack}</Text>
                </>
              )}
              
              {this.state.errorInfo?.componentStack && (
                <>
                  <Text style={styles.errorTitle}>Component Stack:</Text>
                  <Text style={styles.stackText}>{this.state.errorInfo.componentStack}</Text>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  scrollView: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    marginBottom: 20,
  },
  errorContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#dc3545',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#495057',
    marginTop: 15,
    marginBottom: 5,
  },
  errorText: {
    fontSize: 14,
    color: '#dc3545',
    fontFamily: 'monospace',
  },
  stackText: {
    fontSize: 12,
    color: '#6c757d',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});