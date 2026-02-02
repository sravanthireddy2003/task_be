const axios = require('axios');

async function testDashboard() {
  try {
    console.log('Testing dashboard API...');

    const response = await axios.get('http://localhost:4000/api/admin/dashboard', {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    console.log('Success! Response received.');
    console.log('Weekly Trends sample:');
    if (response.data.weeklyTrends && response.data.weeklyTrends.length > 0) {
      response.data.weeklyTrends.slice(0, 2).forEach(trend => {
        console.log(`${trend.day}: ${trend.tasks} tasks, ${trend.tasksList.length} task details`);
      });
    }

  } catch (error) {
    console.error('Full error object:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testDashboard();