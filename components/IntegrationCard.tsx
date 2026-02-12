/**
 * Integration Card Component
 *
 * Unified collapsible card for all integrations in Settings
 * Provides consistent UX across Local, Cloud, and Data integrations
 */

import React, { useState, useCallback } from 'react'
import { ChevronDown, Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react'

export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface IntegrationCardProps {
  // Identity
  id: string
  name: string
  description: string
  icon: React.ReactNode

  // Status
  status: IntegrationStatus
  statusText?: string
  badge?: {
    text: string
    variant: 'success' | 'warning' | 'info' | 'neutral'
  }

  // Stats (shown when connected)
  stats?: {
    label: string
    value: string | number
  }[]

  // Actions
  onConnect?: () => void | Promise<void>
  onDisconnect?: () => void | Promise<void>

  // Expandable content
  children?: React.ReactNode
  defaultExpanded?: boolean

  // Styling
  accentColor?: string // tailwind color name like 'orange', 'blue', etc.
}

const STATUS_CONFIG: Record<IntegrationStatus, { icon: React.ReactNode; color: string }> = {
  disconnected: {
    icon: null,
    color: 'text-muted-foreground',
  },
  connecting: {
    icon: <Loader2 size={12} className="animate-spin" />,
    color: 'text-amber-500',
  },
  connected: {
    icon: <Check size={12} />,
    color: 'text-emerald-500',
  },
  error: {
    icon: <AlertCircle size={12} />,
    color: 'text-red-500',
  },
}

const BADGE_VARIANTS = {
  success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30',
  warning: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
  info: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  neutral: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800',
}

const IntegrationCard: React.FC<IntegrationCardProps> = ({
  id,
  name,
  description,
  icon,
  status,
  statusText,
  badge,
  stats,
  onConnect,
  onDisconnect,
  children,
  defaultExpanded = false,
  accentColor = 'blue',
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [isLoading, setIsLoading] = useState(false)

  const statusConfig = STATUS_CONFIG[status]
  const isConnected = status === 'connected'

  const handleToggle = useCallback(() => {
    setIsExpanded(prev => !prev)
  }, [])

  const handleAction = useCallback(async () => {
    if (isLoading) return

    setIsLoading(true)
    try {
      if (isConnected && onDisconnect) {
        await onDisconnect()
      } else if (!isConnected && onConnect) {
        await onConnect()
      }
    } catch (error) {
      console.error(`Integration ${id} action failed:`, error)
    } finally {
      setIsLoading(false)
    }
  }, [id, isConnected, isLoading, onConnect, onDisconnect])

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        isExpanded
          ? 'border-accent/40 bg-accent/5 shadow-sm'
          : 'border-border hover:border-accent/30 hover:bg-muted/30'
      }`}
    >
      {/* Header - Always Visible */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {/* Icon */}
        <div className={`w-10 h-10 rounded-lg bg-${accentColor}-100 dark:bg-${accentColor}-900/30 flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{name}</span>
            {badge && (
              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${BADGE_VARIANTS[badge.variant]}`}>
                {badge.text}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{description}</div>
        </div>

        {/* Status */}
        <div className={`flex items-center gap-1.5 text-xs ${statusConfig.color}`}>
          {statusConfig.icon}
          <span>{statusText || status}</span>
        </div>

        {/* Expand Indicator */}
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-4 animate-fade-in">
          {/* Divider */}
          <div className="border-t border-border/50" />

          {/* Stats Row */}
          {stats && stats.length > 0 && isConnected && (
            <div className="flex items-center gap-4">
              {stats.map((stat, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{stat.label}:</span>
                  <span className={`text-xs font-medium text-${accentColor}-600 dark:text-${accentColor}-400`}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Custom Content */}
          {children}

          {/* Action Button */}
          {(onConnect || onDisconnect) && !children && (
            <button
              onClick={handleAction}
              disabled={isLoading || status === 'connecting'}
              className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                isConnected
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
                  : `bg-${accentColor}-500 hover:bg-${accentColor}-600 text-white`
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{isConnected ? 'Disconnecting...' : 'Connecting...'}</span>
                </>
              ) : (
                <span>{isConnected ? 'Disconnect' : 'Connect'}</span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default IntegrationCard
