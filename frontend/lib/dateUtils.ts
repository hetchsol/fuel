/**
 * Date Format Utilities
 * Standardizes date format to DD-MM-YYYY throughout the frontend
 */

// Standard date format: DD-MM-YYYY
export const DATE_FORMAT = 'DD-MM-YYYY'
export const DATETIME_FORMAT = 'DD-MM-YYYY HH:mm:ss'

/**
 * Convert ISO date string (YYYY-MM-DD) to display format (DD-MM-YYYY)
 */
export function formatDateToDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return ''

  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr

    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()

    return `${day}-${month}-${year}`
  } catch (error) {
    return dateStr
  }
}

/**
 * Convert display format (DD-MM-YYYY) to ISO format (YYYY-MM-DD)
 * Used for API calls and date inputs
 */
export function formatDateToISO(dateStr: string | null | undefined): string {
  if (!dateStr) return ''

  try {
    // Check if already in ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return dateStr.split('T')[0]
    }

    // Parse DD-MM-YYYY format
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const day = parts[0]
      const month = parts[1]
      const year = parts[2]
      return `${year}-${month}-${day}`
    }

    // Try parsing as date
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  } catch (error) {
    return dateStr
  }
}

/**
 * Convert ISO datetime to display format (DD-MM-YYYY HH:mm:ss)
 */
export function formatDateTimeToDisplay(datetimeStr: string | null | undefined): string {
  if (!datetimeStr) return ''

  try {
    const date = new Date(datetimeStr)
    if (isNaN(date.getTime())) return datetimeStr

    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`
  } catch (error) {
    return datetimeStr
  }
}

/**
 * Get today's date in DD-MM-YYYY format
 */
export function getTodayDisplay(): string {
  return formatDateToDisplay(new Date().toISOString())
}

/**
 * Get today's date in YYYY-MM-DD format (for date inputs)
 */
export function getTodayISO(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format date for HTML date input (always YYYY-MM-DD)
 */
export function formatForDateInput(dateStr: string | null | undefined): string {
  if (!dateStr) return getTodayISO()
  return formatDateToISO(dateStr)
}

/**
 * Validate if a date string is in DD-MM-YYYY format
 */
export function isValidDisplayDate(dateStr: string): boolean {
  if (!dateStr) return false
  const regex = /^\d{2}-\d{2}-\d{4}$/
  if (!regex.test(dateStr)) return false

  const parts = dateStr.split('-')
  const day = parseInt(parts[0])
  const month = parseInt(parts[1])
  const year = parseInt(parts[2])

  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  if (year < 1900 || year > 2100) return false

  return true
}

/**
 * Get date range string for display
 * Example: "01-12-2025 to 14-12-2025"
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = formatDateToDisplay(startDate)
  const end = formatDateToDisplay(endDate)
  return `${start} to ${end}`
}

/**
 * Parse various date formats to Date object
 */
export function parseFlexibleDate(dateStr: string): Date | null {
  if (!dateStr) return null

  try {
    // Try ISO format
    let date = new Date(dateStr)
    if (!isNaN(date.getTime())) return date

    // Try DD-MM-YYYY
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
      if (!isNaN(date.getTime())) return date
    }

    // Try DD/MM/YYYY
    const slashParts = dateStr.split('/')
    if (slashParts.length === 3) {
      date = new Date(`${slashParts[2]}-${slashParts[1]}-${slashParts[0]}`)
      if (!isNaN(date.getTime())) return date
    }

    return null
  } catch (error) {
    return null
  }
}
