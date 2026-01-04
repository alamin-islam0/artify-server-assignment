# Admin Dashboard Implementation Guide

Since I only have access to the `artify-server` repository, I have implemented the necessary **Backend APIs** to support your Admin Dashboard.

I have also designed the **Frontend Components** for you below. You can copy these into your React client project (e.g., `src/pages/Dashboard/Admin`).

## 1. Backend Updates (Already Applied)

The `index.js` file has been updated to include:

- **User Management**: `usersCollection` to track users and roles (User/Admin).
- **Report Management**: `reportsCollection` to handle flagged arts.
- **Admin Stats**: `/admin/stats` endpoint for the dashboard overview.
- **Endpoints**:
  - `POST /users`: Sync user data from login.
  - `GET /users`: List all users (with art counts).
  - `PATCH /users/:id/role`: Promote/Demote users.
  - `GET /admin/stats`: Get dashboard metrics.
  - `GET /admin/arts`: Get all arts for moderation.
  - `POST /reports`: Submit a report.
  - `GET /admin/reports`: View reports.
  - `DELETE /admin/reports/:id`: Resolve report.

---

## 2. Frontend Implementation (Copy to Client)

### Dependencies

Ensure you have these installed:

```bash
npm install recharts lucide-react axios react-hot-toast
```

### A. Admin Dashboard Home (`DashboardHome.jsx`)

```jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Users, FileImage, AlertTriangle, TrendingUp } from "lucide-react";

const StatCard = ({ title, count, icon: Icon, color }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
    <div
      className={`p-3 rounded-full ${color} bg-opacity-10 text-${color.replace(
        "bg-",
        ""
      )}-600`}
    >
      <Icon size={24} />
    </div>
    <div>
      <p className="text-gray-500 text-sm">{title}</p>
      <h3 className="text-2xl font-bold text-gray-800">{count}</h3>
    </div>
  </div>
);

const DashboardHome = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get("http://localhost:3000/admin/stats"); // Adjust URL
      setStats(res.data);
    } catch (error) {
      console.error("Failed to fetch stats", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading dashboard...</div>;
  if (!stats) return <div>Error loading stats.</div>;

  return (
    <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
        <p className="text-gray-500">Platform Overview & Analytics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Users"
          count={stats.totalUsers}
          icon={Users}
          color="bg-blue-500"
        />
        <StatCard
          title="Total Public Arts"
          count={stats.totalPublicArts}
          icon={FileImage}
          color="bg-green-500"
        />
        <StatCard
          title="Reported Arts"
          count={stats.totalReportedArts}
          icon={AlertTriangle}
          color="bg-red-500"
        />
        <StatCard
          title="New Arts Today"
          count={stats.newArtsToday}
          icon={TrendingUp}
          color="bg-purple-500"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Arts Growth Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-6">
            Arts Growth (Last 30 Days)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.artsGrowth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="_id" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Contributors */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-6">Top Contributors</h3>
          <div className="space-y-4">
            {stats.topContributors.map((user, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">
                      {user.name || user._id}
                    </p>
                    <p className="text-xs text-gray-500">{user._id}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-600">
                  {user.count} Arts
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
```

### B. Manage Users (`ManageUsers.jsx`)

```jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { Trash2, ShieldCheck, User } from "lucide-react";
import toast from "react-hot-toast";
import Swal from "sweetalert2";

const ManageUsers = () => {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const res = await axios.get("http://localhost:3000/users");
    setUsers(res.data);
  };

  const handleRoleUpdate = async (id, currentRole) => {
    const newRole = currentRole === "Admin" ? "User" : "Admin";
    try {
      await axios.patch(`http://localhost:3000/users/${id}/role`, {
        role: newRole,
      });
      toast.success(`User role updated to ${newRole}`);
      fetchUsers();
    } catch (err) {
      toast.error("Failed to update role");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Manage Users</h1>
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-600">User</th>
              <th className="p-4 font-semibold text-gray-600">Email</th>
              <th className="p-4 font-semibold text-gray-600">Role</th>
              <th className="p-4 font-semibold text-gray-600">Arts Created</th>
              <th className="p-4 font-semibold text-gray-600 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user._id} className="hover:bg-gray-50">
                <td className="p-4 flex items-center gap-3">
                  <img
                    src={user.photoURL || "https://via.placeholder.com/40"}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <span className="font-medium">
                    {user.displayName || "Unknown"}
                  </span>
                </td>
                <td className="p-4 text-gray-600">{user.email}</td>
                <td className="p-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      user.role === "Admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="p-4 font-medium">{user.totalArts || 0}</td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => handleRoleUpdate(user._id, user.role)}
                    className="text-indigo-600 hover:text-indigo-800 mr-4 text-sm font-medium"
                  >
                    {user.role === "Admin" ? "Demote" : "Make Admin"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default ManageUsers;
```

### C. Reported Arts (`ReportedArts.jsx`)

```jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { EyeOff, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import Swal from "sweetalert2";

const ReportedArts = () => {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    const res = await axios.get("http://localhost:3000/admin/reports");
    setReports(res.data);
  };

  const handleDeleteArt = async (artId, reportId) => {
    Swal.fire({
      title: "Delete Art?",
      text: "This will permanently remove the reported art.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await axios.delete(`http://localhost:3000/arts/${artId}`);
          // Also resolve the report implicitly
          fetchReports();
          Swal.fire("Deleted!", "Art has been removed.", "success");
        } catch (err) {
          toast.error("Failed to delete art");
        }
      }
    });
  };

  const handleIgnoreReport = async (reportId) => {
    try {
      await axios.delete(`http://localhost:3000/admin/reports/${reportId}`);
      toast.success("Report ignored/resolved");
      fetchReports();
    } catch (err) {
      toast.error("Failed to resolve report");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Reported Arts</h1>
      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="w-full text-left">
          <thead className="bg-red-50 border-b border-red-100">
            <tr>
              <th className="p-4 text-red-800">Art Title</th>
              <th className="p-4 text-red-800">Reporter</th>
              <th className="p-4 text-red-800">Reason</th>
              <th className="p-4 text-red-800 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {reports.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-8 text-center text-gray-500">
                  No reported arts found. Great job!
                </td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report._id} className="hover:bg-gray-50 group">
                  <td className="p-4 font-medium">
                    {report.artTitle || "Unknown Art"}
                  </td>
                  <td className="p-4 text-gray-600 text-sm">
                    {report.reporterEmail}
                    <br />
                    <span className="text-xs text-gray-400">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="p-4 text-gray-700 italic">
                    "{report.reason}"
                  </td>
                  <td className="p-4 text-right flex justify-end gap-2">
                    <button
                      onClick={() => handleDeleteArt(report.artId, report._id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 text-sm font-medium transition"
                    >
                      <EyeOff size={16} /> Delete Art
                    </button>
                    <button
                      onClick={() => handleIgnoreReport(report._id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm font-medium transition"
                    >
                      <CheckCircle size={16} /> Ignore
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportedArts;
```

### D. Setup Instructions

1.  **Routes**: Add these routes to your client-side Router (e.g. `main.jsx` or `Routes.jsx`), ensuring they are wrapped in an **AdminRoute** protection (checks if `user.role === 'Admin'`).
    ```jsx
    {
      path: 'dashboard/admin',
      element: <AdminLayout />, // Your sidebar layout
      children: [
        { path: '', element: <DashboardHome /> },
        { path: 'manage-users', element: <ManageUsers /> },
        { path: 'reported-arts', element: <ReportedArts /> },
        // ... add ManageArts and Profile similarly
      ]
    }
    ```
2.  **Authentication**: When a user logs in (e.g., via Firebase), make sure to call `POST /users` with `{ email, displayName, photoURL }` to sync them to the database so the admin panel can see them.

This implementation provides a "Clean, Modern, and Data-Focused" design as requested, utilizing Tailwind CSS for styling and Recharts for visualization.
