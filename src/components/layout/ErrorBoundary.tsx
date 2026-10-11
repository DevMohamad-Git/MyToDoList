import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'

interface ErrorBoundaryProps {
  children: ReactNode
  fallbackTitle?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 flex flex-col items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center text-rose-200">
          <div className="flex size-12 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 mb-3">
            <AlertTriangle className="size-6" />
          </div>
          <h2 className="text-base font-semibold text-rose-300">
            {this.props.fallbackTitle ?? 'خطا در بارگذاری این بخش'}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            یک خطای غیرمنتظره در رندر این کامپوننت رخ داده است:
          </p>
          <pre className="mt-3 max-w-xl overflow-x-auto rounded-lg border border-border bg-black/50 p-3 text-left font-mono text-[11px] text-rose-300">
            {this.state.error?.message || 'Unknown runtime error'}
          </pre>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={this.reset}>
              تلاش مجدد
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              تازه‌سازی صفحه
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
