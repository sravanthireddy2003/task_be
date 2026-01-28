// src/components/TaskStatusButton.jsx
// Smart button component that shows appropriate action based on role and current state

import React from 'react';
import axios from 'axios';

const TaskStatusButton = ({ taskId, currentState, userRole, onStateChange }) => {
  const handleClick = async (toState) => {
    try {
      const response = await axios.post('/api/workflow/request', {
        tenantId: 1, // From context
        entityType: 'TASK',
        entityId: taskId,
        toState,
        meta: { reason: 'User initiated' }
      });
      if (response.data.data.status === 'APPLIED') {
        onStateChange(toState);
      } else {
        alert('Approval request submitted');
      }
    } catch (error) {
      console.error('Error requesting transition:', error);
    }
  };

  const getButtonText = () => {
    switch (userRole) {
      case 'EMPLOYEE':
        if (currentState === 'Assigned') return 'Mark In Progress';
        if (currentState === 'In Progress') return 'Send for Review';
        break;
      case 'MANAGER':
        if (currentState === 'Review') return 'Approve Completion';
        break;
      case 'ADMIN':
        return 'Change Status';
      default:
        return null;
    }
    return null;
  };

  const getNextState = () => {
    switch (userRole) {
      case 'EMPLOYEE':
        if (currentState === 'Assigned') return 'In Progress';
        if (currentState === 'In Progress') return 'Review';
        break;
      case 'MANAGER':
        if (currentState === 'Review') return 'Completed';
        break;
      default:
        return null;
    }
    return null;
  };

  const buttonText = getButtonText();
  const nextState = getNextState();

  if (!buttonText) return null;

  return (
    <button onClick={() => handleClick(nextState)}>
      {buttonText}
    </button>
  );
};

export default TaskStatusButton;