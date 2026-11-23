/**
 * School Management System - Client API Bridge
 * Connects Frontend UI seamlessly to Node.js & MongoDB Backend
 */

const API_BASE = window.location.origin;

window.SchoolAPI = {
  getToken() {
    return localStorage.getItem('token');
  },

  setAuth(data) {
    if (data.token) localStorage.setItem('token', data.token);
    if (data.user) {
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('userRole', data.user.role);
      localStorage.setItem('userName', data.user.name || data.user.username);
      if (data.user.campus) localStorage.setItem('loggedInAdminCampus', data.user.campus);
      if (data.user.studentId) localStorage.setItem('loggedInStudent', data.user.studentId);
    }
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userRole');
    localStorage.removeItem('loggedInStudent');
    localStorage.removeItem('loggedInAdmin');
    localStorage.removeItem('loggedInSuperAdmin');
    window.location.href = './login.html';
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Request failed with status ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  },

  // ================= AUTH =================
  async login(username, password, role) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
    this.setAuth(res);
    return res;
  },

  // ================= STUDENTS =================
  async getStudents(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await this.request(`/api/students?${query}`);
    return res.students || [];
  },

  async getStudent(id) {
    const res = await this.request(`/api/students/${encodeURIComponent(id)}`);
    return res.student;
  },

  async addStudent(studentData) {
    const res = await this.request('/api/students', {
      method: 'POST',
      body: JSON.stringify(studentData)
    });
    return res.student;
  },

  async updateStudent(id, studentData) {
    const res = await this.request(`/api/students/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(studentData)
    });
    return res.student;
  },

  async deleteStudent(id) {
    return await this.request(`/api/students/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // ================= FEES =================
  async getFees(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/api/fees?${query}` : '/api/fees';
    const res = await this.request(endpoint);
    return res.fees || {};
  },

  async getStudentFee(id) {
    const res = await this.request(`/api/fees/student/${encodeURIComponent(id)}`);
    return res.fee;
  },

  async recordFee(data) {
    return await this.request('/api/fees/payment', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // ================= ATTENDANCE =================
  async getAttendance(studentId) {
    const res = await this.request(`/api/attendance/student/${encodeURIComponent(studentId)}`);
    return res;
  },

  async markAttendance(data) {
    return await this.request('/api/attendance/mark', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // ================= NOTICES =================
  async getNotices(type, campus) {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (campus) params.append('campus', campus);
    const res = await this.request(`/api/notices?${params.toString()}`);
    return (res.notices || []).map(n => ({
      ...n,
      id: n._id || n.id,
      desc: n.desc || n.content || '',
      content: n.content || n.desc || '',
      sender: n.sender || n.postedBy || 'Administrator',
      postedBy: n.postedBy || n.sender || 'Administrator',
      target: n.target || n.campus || 'All Students',
      campus: n.campus || n.target || 'All Campuses',
      priority: n.priority || 'Normal'
    }));
  },

  async postNotice(noticeData) {
    return await this.request('/api/notices', {
      method: 'POST',
      body: JSON.stringify(noticeData)
    });
  },

  async deleteNotice(id) {
    const role = localStorage.getItem('userRole') || 'admin';
    await this.ensureAuth(role);
    try {
      return await this.request(`/api/notices/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch (err) {
      if (err.message && (err.message.includes('404') || err.message.toLowerCase().includes('not found'))) {
        return { success: true, message: 'Notice already removed on server.' };
      }
      throw err;
    }
  },

  // ================= ACHIEVEMENTS =================
  async getAchievements() {
    const res = await this.request('/api/achievements').catch(() => ({ achievements: [] }));
    return res.achievements || [];
  },

  async addAchievement(data) {
    const role = localStorage.getItem('userRole') || 'admin';
    await this.ensureAuth(role);
    try {
      return await this.request('/api/achievements', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch (err) {
      if (err.message && (err.message.includes('401') || err.message.includes('token') || err.message.includes('expired'))) {
        localStorage.removeItem('token');
        await this.ensureAuth(role);
        return await this.request('/api/achievements', {
          method: 'POST',
          body: JSON.stringify(data)
        });
      }
      throw err;
    }
  },

  async deleteAchievement(id) {
    const role = localStorage.getItem('userRole') || 'admin';
    await this.ensureAuth(role);
    try {
      return await this.request(`/api/achievements/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch (err) {
      if (err.message && (err.message.includes('401') || err.message.includes('token') || err.message.includes('expired'))) {
        localStorage.removeItem('token');
        await this.ensureAuth(role);
        return await this.request(`/api/achievements/${encodeURIComponent(id)}`, {
          method: 'DELETE'
        });
      }
      throw err;
    }
  },

  // ================= ADMISSION & ADMIN MANAGEMENT =================
  async submitAdmission(data) {
    return await this.request('/api/admissions', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getAdmissions(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/api/admissions?${query}` : '/api/admissions';
    const res = await this.request(endpoint);
    return res.applications || [];
  },

  async updateAdmin(username, data) {
    return await this.request(`/api/auth/users/${encodeURIComponent(username)}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  // ================= SYNC & AUTO-AUTH UTILITY =================
  async ensureAuth(defaultRole = 'student') {
    const token = this.getToken();
    const currentRole = localStorage.getItem('userRole');
    // If a valid session with the correct role already exists, preserve it!
    if (token && currentRole === defaultRole) {
      return;
    }
    // Only auto-login with default test credentials if NO session token exists
    if (!token) {
      try {
        if (defaultRole === 'student') await this.login('STUDENT', 'student123', 'student');
        else if (defaultRole === 'admin') await this.login('ADMIN', 'admin123', 'admin');
        else if (defaultRole === 'superadmin') await this.login('SUPERADMIN', 'super123', 'superadmin');
      } catch (e) {
        console.warn('Auto auth notice:', e.message);
      }
    }
  },

  // Synchronizes local cache with server state on page load
  async syncDashboard(role = 'admin', campus = null) {
    await this.ensureAuth(role);
    try {
      const studentParams = campus && campus !== 'All Campuses' ? { campus } : {};
      const feeParams = campus && campus !== 'All Campuses' ? { campus } : {};
      const [students, fees, notices, achievements] = await Promise.all([
        this.getStudents(studentParams).catch(() => []),
        this.getFees(feeParams).catch(() => ({})),
        this.getNotices('all', campus).catch(() => []),
        this.getAchievements().catch(() => [])
      ]);

      if (students && students.length > 0) {
        localStorage.setItem('adminStudentsData', JSON.stringify(students));
      }
      if (fees && Object.keys(fees).length > 0) {
        localStorage.setItem('adminFees', JSON.stringify(fees));
      }
      if (Array.isArray(notices)) {
        localStorage.setItem('adminNotices', JSON.stringify(notices.filter(n => n.type === 'admin')));
        localStorage.setItem('globalNotices', JSON.stringify(notices.filter(n => n.type === 'global' || !n.type)));
        localStorage.setItem('allNotices', JSON.stringify(notices));
      }
      if (achievements) {
        localStorage.setItem('adminAchievements', JSON.stringify(achievements));
      }

      return { students, fees, notices, achievements };
    } catch (err) {
      console.warn('Sync notice:', err.message);
    }
  }
};
