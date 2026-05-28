import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

interface User {
  user_id: string
  username: string
  full_name: string
  role: string
  station_id?: string
  is_active?: boolean
}

interface ConfirmDialog {
  title: string
  message: string
  confirmLabel: string
  confirmColor: string
  onConfirm: () => void
}

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'user',
    station_id: 'ST001'
  })
  const [resetPasswordResult, setResetPasswordResult] = useState<{ username: string; password: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const [currentUserStationId, setCurrentUserStationId] = useState<string>('')
  const [stations, setStations] = useState<Array<{ station_id: string; name?: string; status?: string }>>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsed = JSON.parse(userData)
      setCurrentUserRole(parsed.role || '')
      setCurrentUserStationId(parsed.station_id || '')
    }
    fetchUsers()
    // Real stations for the Station dropdown (no more typing free-text IDs).
    authFetch(`${BASE}/stations/`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setStations(Array.isArray(data) ? data : []))
      .catch(() => setStations([]))
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await authFetch(`${BASE}/auth/users`, {
        headers: getHeaders()
      })
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      setUsers(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingUser(null)
    setFormData({
      username: '',
      password: '',
      full_name: '',
      role: 'user',
      station_id: 'ST001'
    })
    setShowModal(true)
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      password: '',
      full_name: user.full_name,
      role: user.role,
      station_id: user.station_id || 'ST001'
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const url = editingUser
        ? `${BASE}/auth/users/${editingUser.username}`
        : `${BASE}/auth/users`

      const method = editingUser ? 'PUT' : 'POST'

      const res = await authFetch(url, {
        method,
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to save user')
      }

      setShowModal(false)
      fetchUsers()
      toast.success(editingUser ? 'User updated successfully' : 'User created successfully')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDelete = (username: string) => {
    setConfirmDialog({
      title: 'Delete User',
      message: `Are you sure you want to delete user "${username}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      confirmColor: 'bg-status-error text-white hover:opacity-90',
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          const res = await authFetch(`${BASE}/auth/users/${username}`, {
            method: 'DELETE',
            headers: getHeaders()
          })
          if (!res.ok) {
            const errorData = await res.json()
            throw new Error(errorData.detail || 'Failed to delete user')
          }
          fetchUsers()
          toast.success('User deleted successfully')
        } catch (err: any) {
          setError(err.message)
        }
      }
    })
  }

  const handleToggleStatus = (user: User) => {
    const action = user.is_active !== false ? 'disable' : 'enable'
    setConfirmDialog({
      title: `${action === 'disable' ? 'Disable' : 'Enable'} User`,
      message: `Are you sure you want to ${action} user "${user.username}"?${action === 'disable' ? ' They will be logged out immediately.' : ''}`,
      confirmLabel: action === 'disable' ? 'Disable' : 'Enable',
      confirmColor: action === 'disable' ? 'bg-status-warning text-gray-900 hover:opacity-90' : 'bg-status-success text-white hover:opacity-90',
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          const res = await authFetch(`${BASE}/auth/users/${user.username}/toggle-status`, {
            method: 'PATCH',
            headers: getHeaders()
          })
          if (!res.ok) {
            const errorData = await res.json()
            throw new Error(errorData.detail || `Failed to ${action} user`)
          }
          fetchUsers()
          toast.success(`User ${user.username} ${action}d successfully`)
        } catch (err: any) {
          setError(err.message)
        }
      }
    })
  }

  const handleResetPassword = (username: string) => {
    setConfirmDialog({
      title: 'Reset Password',
      message: `Are you sure you want to reset the password for "${username}"? Their current password will be replaced and they will be logged out.`,
      confirmLabel: 'Reset Password',
      confirmColor: 'bg-action-primary text-white hover:bg-action-primary-hover',
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          const res = await authFetch(`${BASE}/auth/users/${username}/reset-password`, {
            method: 'POST',
            headers: getHeaders()
          })
          if (!res.ok) {
            const errorData = await res.json()
            throw new Error(errorData.detail || 'Failed to reset password')
          }
          const data = await res.json()
          setResetPasswordResult({ username, password: data.new_password })
          toast.success(`Password reset for ${username}`)
        } catch (err: any) {
          setError(err.message)
        }
      }
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Password copied to clipboard')
    }).catch(() => {
      toast.error('Failed to copy — please select and copy manually')
    })
  }

  const getRoleBadge = (role: string) => {
    const colors = {
      owner: 'bg-category-a-light text-category-a',
      supervisor: 'bg-action-primary-light text-action-primary',
      user: 'bg-status-success-light text-status-success'
    }
    return colors[role as keyof typeof colors] || 'bg-surface-bg text-content-primary'
  }

  const getStatusBadge = (isActive: boolean) => {
    return isActive
      ? 'bg-status-success-light text-status-success'
      : 'bg-status-error-light text-status-error'
  }

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-content-primary">User Management</h1>
          <p className="mt-2 text-sm text-content-secondary">Manage system users and staff members</p>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary"
        >
          + Add User
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-status-error-light border border-status-error rounded-md">
          <p className="text-status-error">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="bg-surface-card rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-surface-border">
            <thead className="bg-surface-bg">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                  User ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                  Full Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                  Station
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface-card divide-y divide-surface-border">
              {users.filter(u => currentUserRole === 'manager' ? !['manager', 'owner'].includes(u.role) : true).map((user) => (
                <tr key={user.user_id} className={`hover:bg-surface-bg ${user.is_active === false ? 'opacity-60' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-content-primary">
                    {user.user_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-content-primary">
                    {user.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-content-primary">
                    {user.full_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadge(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(user.is_active !== false)}`}>
                      {user.is_active !== false ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-content-secondary">
                    {user.station_id || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleEdit(user)}
                      className="text-action-primary hover:text-action-primary-hover"
                    >
                      Edit
                    </button>
                    {user.role !== 'owner' && (
                      <>
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={user.is_active !== false
                            ? 'text-status-warning hover:opacity-80'
                            : 'text-status-success hover:opacity-80'
                          }
                        >
                          {user.is_active !== false ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleResetPassword(user.username)}
                          className="text-action-primary hover:text-action-primary-hover"
                        >
                          Reset PW
                        </button>
                        <button
                          onClick={() => handleDelete(user.username)}
                          className="text-status-error hover:opacity-80"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-surface-card rounded-lg p-6 w-full max-w-sm mx-4 shadow-xl">
            <h2 className="text-lg font-bold text-content-primary mb-2">{confirmDialog.title}</h2>
            <p className="text-sm text-content-secondary mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-surface-bg text-content-primary border border-surface-border rounded-md hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-surface-border"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmDialog.confirmColor}`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-surface-card rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-content-primary">
              {editingUser ? 'Edit User' : 'Create New User'}
            </h2>

            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    disabled={!!editingUser}
                    required
                    className="w-full px-3 py-2 bg-surface-bg text-content-primary border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-surface-bg text-content-primary border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Password {editingUser && '(leave blank to keep current)'}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                    className="w-full px-3 py-2 bg-surface-bg text-content-primary border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-bg text-content-primary border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  >
                    <option value="user">User (Staff)</option>
                    <option value="supervisor">Supervisor</option>
                    {currentUserRole !== 'manager' && <option value="manager">Manager</option>}
                    {currentUserRole !== 'manager' && <option value="owner">Owner</option>}
                  </select>
                </div>

                {formData.role !== 'owner' && (() => {
                  // Managers can only assign within their own station.
                  const lockedToOwn = currentUserRole === 'manager'
                  const visibleStations = stations.filter(s => (s.status || 'active') !== 'disabled')
                  return (
                    <div>
                      <label className="block text-sm font-medium text-content-secondary mb-1">
                        Station
                      </label>
                      <select
                        value={lockedToOwn ? currentUserStationId : formData.station_id}
                        onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
                        disabled={lockedToOwn}
                        className="w-full px-3 py-2 bg-surface-bg text-content-primary border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary disabled:opacity-70"
                      >
                        {!lockedToOwn && <option value="">Select a station…</option>}
                        {visibleStations.map(s => (
                          <option key={s.station_id} value={s.station_id}>
                            {s.name ? `${s.name} (${s.station_id})` : s.station_id}
                          </option>
                        ))}
                      </select>
                      {lockedToOwn && (
                        <p className="text-xs text-content-secondary mt-1">
                          Locked to your station. Owners can assign across stations.
                        </p>
                      )}
                    </div>
                  )
                })()}
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-surface-bg text-content-primary border border-surface-border rounded-md hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-surface-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary"
                >
                  {editingUser ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Result Modal */}
      {resetPasswordResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-surface-card rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-content-primary">Password Reset Successful</h2>
            <p className="text-sm text-content-secondary mb-4">
              New password for <strong className="text-content-primary">{resetPasswordResult.username}</strong>:
            </p>
            <div className="flex items-center gap-2 mb-4">
              <code className="flex-1 px-4 py-3 bg-surface-bg border border-surface-border rounded-md text-lg font-mono text-content-primary select-all">
                {resetPasswordResult.password}
              </code>
              <button
                onClick={() => copyToClipboard(resetPasswordResult.password)}
                className="px-3 py-3 bg-action-primary text-white rounded-md hover:bg-action-primary-hover"
                title="Copy to clipboard"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-status-warning mb-4">
              Please save this password now. It will not be shown again.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setResetPasswordResult(null)}
                className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff List Info */}
      <div className="mt-6 bg-action-primary-light border border-action-primary rounded-lg p-4">
        <h3 className="text-sm font-semibold text-action-primary mb-2">Staff Members</h3>
        <p className="text-sm text-action-primary mb-2">
          Active staff members: <strong>{users.filter(u => u.role === 'user' && u.is_active !== false).map(u => u.full_name).join(', ')}</strong>
        </p>
        <p className="text-sm text-action-primary">
          These staff members are available for selection when assigning shifts and recording readings.
        </p>
      </div>
    </div>
  )
}
