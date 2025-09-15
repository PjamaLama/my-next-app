"use client";

import React, { useEffect, useState } from 'react';
import { useFirebase } from '@/app/providers/FirebaseProvider';

interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  wa_id: string | null;
  wa_id_updated_at: string | null;
  createdAt: string | null;
  lastActivity: string | null;
  userType: string;
  upgradedAt: string | null;
  isBetaUser: boolean;
}

export default function AdminUserManagement() {
  const { user } = useFirebase();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [betaEmail, setBetaEmail] = useState('');
  const [settingBetaUser, setSettingBetaUser] = useState(false);

  const loadUsers = async (searchTerm: string = '', append: boolean = false) => {
    if (!user) return;

    if (!append) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (append) params.append('offset', users.length.toString());

      const response = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const data = await response.json();
      if (data.success) {
        if (append) {
          setUsers(prev => [...prev, ...data.data.users]);
        } else {
          setUsers(data.data.users);
        }
        setHasMore(data.data.hasMore);
      } else {
        throw new Error(data.error || 'Failed to load users');
      }
    } catch (err: any) {
      console.error('Users load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [user]);

  const handleSearch = () => {
    loadUsers(search);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const toggleBetaUser = async (uid: string, currentStatus: boolean) => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/toggle-beta-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ uid, isBetaUser: !currentStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to toggle beta user status');
      }

      // Update local state
      setUsers(prev => prev.map(u =>
        u.uid === uid ? { ...u, isBetaUser: !currentStatus } : u
      ));

      // Update selected user if it's the same user
      if (selectedUser?.uid === uid) {
        setSelectedUser(prev => prev ? { ...prev, isBetaUser: !currentStatus } : null);
      }
    } catch (error) {
      console.error('Error toggling beta user status:', error);
      alert('Failed to toggle beta user status. Please try again.');
    }
  };

  const setBetaUserByEmail = async (email: string, isBetaUser: boolean = true) => {
    if (!user || !email.trim()) return;

    setSettingBetaUser(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/set-beta-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: email.trim(), isBetaUser })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to set beta user status');
      }

      const result = await response.json();
      alert(`Successfully ${isBetaUser ? 'enabled' : 'disabled'} beta user status for ${result.data.email}`);

      // Refresh the user list if the user is currently visible
      if (search && email.toLowerCase().includes(search.toLowerCase())) {
        loadUsers(search);
      }

      setBetaEmail('');
    } catch (error: any) {
      console.error('Error setting beta user status:', error);
      alert(`Failed to set beta user status: ${error.message}`);
    } finally {
      setSettingBetaUser(false);
    }
  };

  const UserRow = ({ userData }: { userData: UserData }) => (
    <div
      className="flex items-center justify-between p-4 border border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
      onClick={() => setSelectedUser(userData)}
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
          {(userData.displayName || userData.email || 'U').charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-white font-medium">
            {userData.displayName || 'No name'}
          </div>
          <div className="text-white/60 text-sm">
            {userData.email || 'No email'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className={`px-2 py-1 rounded text-xs ${
              userData.userType === 'pro' ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-500/20 text-gray-300'
            }`}>
              {userData.userType}
            </div>
            {userData.isBetaUser && (
              <div className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300">
                Beta
              </div>
            )}
          </div>
          <div className="text-white/50">
            Joined {formatDate(userData.createdAt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleBetaUser(userData.uid, userData.isBetaUser);
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              userData.isBetaUser ? 'bg-blue-600' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                userData.isBetaUser ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <div className="text-white/40">→</div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="glass rounded-xl p-6 border border-white/10">
        <div className="text-white/60 text-sm">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">User Management</h2>
        <button
          onClick={() => loadUsers(search)}
          className="px-4 py-2 bg-white/10 border border-white/10 text-white/80 rounded-lg hover:bg-white/20"
        >
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Search by email..."
          className="flex-1 px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder-white/50"
        />
        <button
          onClick={handleSearch}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
        >
          Search
        </button>
      </div>

      {/* Set Beta User by Email */}
      <div className="flex gap-2">
        <input
          type="email"
          value={betaEmail}
          onChange={(e) => setBetaEmail(e.target.value)}
          placeholder="Enter user email to make beta user..."
          className="flex-1 px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder-white/50"
        />
        <button
          onClick={() => setBetaUserByEmail(betaEmail, true)}
          disabled={settingBetaUser || !betaEmail.trim()}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg"
        >
          {settingBetaUser ? 'Setting...' : 'Make Beta'}
        </button>
        <button
          onClick={() => setBetaUserByEmail(betaEmail, false)}
          disabled={settingBetaUser || !betaEmail.trim()}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg"
        >
          Remove Beta
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-600/20 border border-red-500/30 rounded-lg text-red-300">
          {error}
        </div>
      )}

      {/* User List */}
      <div className="space-y-3 max-h-[60vh] overflow-auto">
        {users.length === 0 ? (
          <div className="text-center py-8 text-white/60">
            {search ? 'No users found matching your search' : 'No users found'}
          </div>
        ) : (
          <>
            {users.map((userData) => (
              <UserRow key={userData.uid} userData={userData} />
            ))}

            {hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={() => loadUsers(search, true)}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-white/10 border border-white/10 text-white/80 rounded-lg hover:bg-white/20 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#0b0b0e] rounded-xl border border-white/10 p-6 max-w-md w-full max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">User Details</h3>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-xl">
                  {(selectedUser.displayName || selectedUser.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-white font-semibold text-lg">
                    {selectedUser.displayName || 'No display name'}
                  </div>
                  <div className="text-white/60">{selectedUser.email || 'No email'}</div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/10">
                <div className="flex justify-between">
                  <span className="text-white/60">User ID:</span>
                  <span className="text-white font-mono text-sm">{selectedUser.uid}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-white/60">Account Type:</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    selectedUser.userType === 'pro' ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-500/20 text-gray-300'
                  }`}>
                    {selectedUser.userType}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-white/60">Beta User:</span>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      selectedUser.isBetaUser ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-500/20 text-gray-300'
                    }`}>
                      {selectedUser.isBetaUser ? 'Yes (Unlimited Messages)' : 'No'}
                    </span>
                    <button
                      onClick={() => toggleBetaUser(selectedUser.uid, selectedUser.isBetaUser)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        selectedUser.isBetaUser ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          selectedUser.isBetaUser ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between">
                  <span className="text-white/60">Joined:</span>
                  <span className="text-white">{formatDate(selectedUser.createdAt)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-white/60">Last Activity:</span>
                  <span className="text-white">{formatDate(selectedUser.lastActivity)}</span>
                </div>

                {selectedUser.upgradedAt && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Upgraded:</span>
                    <span className="text-white">{formatDate(selectedUser.upgradedAt)}</span>
                  </div>
                )}

                {selectedUser.wa_id && (
                  <div className="flex justify-between">
                    <span className="text-white/60">WhatsApp:</span>
                    <span className="text-green-300">{selectedUser.wa_id}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
