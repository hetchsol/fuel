import { useState, useEffect } from 'react'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

interface User {
  user_id: string
  username: string
  full_name: string
  role: string
  station_id?: string
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

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${BASE}/auth/users`, {
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

      const res = await fetch(url, {
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
      alert(editingUser ? 'User updated successfully' : 'User created successfully')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDelete = async (username: string) => {
    if (!confirm(`Are you sure you want to delete user ${username}?`)) return

    try {
      const res = await fetch(`${BASE}/auth/users/${username}`, {
        method: 'DELETE',
        headers: getHeaders()
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to delete user')
      }

      fetchUsers()
      alert('User deleted successfully')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const getRoleBadge = (role: string) => {
    const colors = {
      owner: 'bg-category-a-light text-category-a',
      supervisor: 'bg-action-primary-light text-action-primary',
      user: 'bg-status-success-light text-status-success'
    }
    return colors[role as keyof typeof colors] || 'bg-surface-bg text-content-primary'
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
                  Station
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface-card divide-y divide-surface-border">
              {users.map((user) => (
                <tr key={user.user_id} className="hover:bg-surface-bg">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-content-secondary">
                    {user.station_id || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(user)}
                      className="text-action-primary hover:text-action-primary mr-4"
                    >
                      Edit
                    </button>
                    {user.role !== 'owner' && (
                      <button
                        onClick={() => handleDelete(user.username)}
                        className="text-status-error hover:text-status-error"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-card rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
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
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary disabled:bg-surface-bg"
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
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
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
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  >
                    <option value="user">User (Staff)</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>

                {formData.role !== 'owner' && (
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">
                      Station ID
                    </label>
                    <input
                      type="text"
                      value={formData.station_id}
                      onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
                      className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-surface-bg text-content-secondary rounded-md hover:bg-surface-bg focus:outline-none focus:ring-2 focus:ring-gray-400"
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

      {/* Staff List Info */}
      <div className="mt-6 bg-action-primary-light border border-action-primary rounded-lg p-4">
        <h3 className="text-sm font-semibold text-action-primary mb-2">Staff Members</h3>
        <p className="text-sm text-action-primary mb-2">
          Registered staff members: <strong>{users.filter(u => u.role === 'user').map(u => u.full_name).join(', ')}</strong>
        </p>
        <p className="text-sm text-action-primary">
          These staff members are available for selection when assigning shifts and recording readings.
        </p>
      </div>
    </div>
  )
}
