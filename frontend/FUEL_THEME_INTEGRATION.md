# Fuel Type Theme Integration Guide

## Overview
The application automatically changes the UI colors based on the selected fuel type:
- **Diesel** → Deep Purple (#524F81)
- **Petrol** → Green (#006D57)
- **Default** → Blue (when no fuel is selected)

## How to Integrate in Your Component

### Step 1: Import the useTheme hook
```typescript
import { useTheme } from '../contexts/ThemeContext'
```

### Step 2: Use the hook in your component
```typescript
export default function YourComponent() {
  const { theme, setFuelType } = useTheme()
  const [selectedFuel, setSelectedFuel] = useState('')

  // Your other component logic...
}
```

### Step 3: Update the fuel type when dropdown changes
```typescript
const handleFuelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
  const value = e.target.value
  setSelectedFuel(value)

  // Update the global theme based on fuel selection
  if (value.toLowerCase() === 'diesel') {
    setFuelType('diesel')
  } else if (value.toLowerCase() === 'petrol') {
    setFuelType('petrol')
  } else {
    setFuelType(null) // Reset to default theme
  }
}
```

### Step 4: Use the theme colors in your UI
```typescript
<div style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
  <select
    value={selectedFuel}
    onChange={handleFuelChange}
    style={{
      borderColor: theme.primary,
      color: theme.textPrimary
    }}
  >
    <option value="">Select Fuel Type</option>
    <option value="diesel">Diesel</option>
    <option value="petrol">Petrol</option>
  </select>
</div>
```

## Complete Example

```typescript
import { useTheme } from '../contexts/ThemeContext'
import { useState } from 'react'

export default function TankForm() {
  const { theme, setFuelType } = useTheme()
  const [fuelType, setFuelTypeState] = useState('')

  const handleFuelTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setFuelTypeState(value)

    // Update global theme
    if (value.toLowerCase() === 'diesel') {
      setFuelType('diesel')
    } else if (value.toLowerCase() === 'petrol') {
      setFuelType('petrol')
    } else {
      setFuelType(null)
    }
  }

  return (
    <div
      className="p-6 rounded-lg shadow-md transition-colors duration-300"
      style={{
        backgroundColor: theme.cardBg,
        borderColor: theme.border,
        borderWidth: '1px'
      }}
    >
      <h2
        className="text-xl font-bold mb-4 transition-colors duration-300"
        style={{ color: theme.textPrimary }}
      >
        Create Tank
      </h2>

      <label
        className="block text-sm font-medium mb-2 transition-colors duration-300"
        style={{ color: theme.textSecondary }}
      >
        Fuel Type
      </label>

      <select
        value={fuelType}
        onChange={handleFuelTypeChange}
        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-all duration-300"
        style={{
          borderColor: theme.border,
          color: theme.textPrimary,
          backgroundColor: theme.background
        }}
      >
        <option value="">Select Fuel Type</option>
        <option value="Diesel">Diesel</option>
        <option value="Petrol">Petrol</option>
      </select>
    </div>
  )
}
```

## Important Notes

1. **Case Insensitive**: Use `.toLowerCase()` when checking fuel type to handle "Diesel", "diesel", "DIESEL", etc.

2. **Reset to Default**: Always call `setFuelType(null)` when:
   - Dropdown is cleared
   - Another option is selected (like "LPG")
   - Component unmounts
   - User navigates away from the page

3. **Existing Dropdowns**: Add the integration to all components that have fuel type dropdowns:
   - Tank creation/editing
   - Nozzle setup
   - Island configuration
   - Reports with fuel filters
   - Sales recording
   - Reading entries

4. **Theme Colors Available**:
   - `theme.primary` - Main brand color (changes with fuel)
   - `theme.secondary` - Secondary accent
   - `theme.accent` - Tertiary accent
   - `theme.primaryLight` - Light version of primary
   - `theme.background` - Page background
   - `theme.cardBg` - Card/panel background
   - `theme.textPrimary` - Main text color
   - `theme.textSecondary` - Secondary text (changes with fuel)
   - `theme.border` - Border color

5. **Smooth Transitions**: All theme properties have CSS transitions, so color changes will be smooth and animated.
