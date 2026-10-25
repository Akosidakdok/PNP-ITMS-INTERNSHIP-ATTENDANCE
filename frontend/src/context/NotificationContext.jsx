import useDeleteConfirmation from '../components/common/useDeleteConfirmation.jsx';
import toast from 'react-hot-toast';
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import api from '../utils/api.js';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user, legalStatus } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef(null);
  const { confirmDelete, deleteConfirmation } = useDeleteConfirmation();

  const fetchNotifications = useCallback(async () => {
    if (!user || legalStatus?.required) return;
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch {}
  }, [user, legalStatus?.required]);

  useEffect(() => {
    if (!user || legalStatus?.required) {
      setNotifications([]);
      setUnreadCount(0);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    fetchNotifications();
  }, [user, legalStatus?.required, fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const clearAllNotifications = () => confirmDelete({
    title: 'Permanently Delete Notifications',
    itemName: `All ${notifications.length} notifications`,
    warning: 'This permanently removes your current notifications and announcements from your notifications list and cannot be undone.',
    onConfirm: async () => {
      try {
        await api.delete('/notifications/clear');
        setNotifications([]);
        setUnreadCount(0);
      } catch (error) {
        console.error('Failed to clear notifications:', error);
        toast.error('Failed to clear notifications. Please try again.');
        return false;
      }
    },
  });

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllRead, clearAllNotifications, fetchNotifications }}>
      {children}
      {deleteConfirmation}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
