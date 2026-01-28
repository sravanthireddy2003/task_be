// src/components/ManagerApprovalPanel.jsx
// React component for managers to view and approve/reject pending workflow requests

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ManagerApprovalPanel = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    try {
      const response = await axios.get('/api/workflow/pending?role=MANAGER');
      setRequests(response.data.data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (requestId, approved, reason) => {
    try {
      await axios.post('/api/workflow/approve', { requestId, approved, reason });
      fetchPendingRequests(); // Refresh list
    } catch (error) {
      console.error('Error approving request:', error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="approval-panel">
      <h2>Pending Approvals</h2>
      {requests.length === 0 ? (
        <p>No pending requests</p>
      ) : (
        <ul>
          {requests.map(request => (
            <li key={request.id}>
              <p>{request.entity_type} {request.entity_id}: {request.from_state} → {request.to_state}</p>
              <p>Requested by: {request.requested_by}</p>
              <button onClick={() => handleApproval(request.id, true, 'Approved')}>Approve</button>
              <button onClick={() => handleApproval(request.id, false, 'Rejected')}>Reject</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ManagerApprovalPanel;