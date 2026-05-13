import axios from 'axios';
import { createGuestUser, getToken } from './api';
import { alert } from '../../../reusables/Toasts';

const getAuthToken = async () => {
  try {
    console.log('🔑 Getting authentication token...');
    const token = await getToken();
    console.log('🔑 Token status:', token ? 'Found' : 'Not found');
    console.log('🔑 Token value:', token ? `${token.substring(0, 10)}...` : 'null');
    return token;
  } catch (error) {
    console.log('🔑 Error getting token:', error);
    return null;
  }
};

// Main API utility function
const apiRequest = async ({
  url,
  method = 'GET',
  body = null,
  headers = {},
  timeout = 10000
}) => {
  console.log('=== 🚀 API Request Debug ===');
  console.log('📍 URL:', url);
  console.log('📍 Method:', method);
  console.log('📍 Body:', body);
  console.log('📍 Custom Headers:', headers);
  
  try {
    // Get token from AsyncStorage
    const token = await getAuthToken();
    
    if (!token) {
      console.log('❌ No authentication token found - throwing error');
      throw new Error('No authentication token found');
    }

    // Prepare request config
    const config = {
      method: method.toLowerCase(),
      url: url,
      timeout: timeout,
      headers: {
        'x-auth-device-token': token,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...headers
      }
    };

    // Add body for POST, PUT, PATCH requests
    if (['post', 'put', 'patch'].includes(method.toLowerCase()) && body) {
      config.data = body;
      console.log('📦 Body added to request');
    }

    console.log('🔗 Final request config:', {
      ...config,
      headers: {
        ...config.headers,
        'x-auth-device-token': config.headers['x-auth-device-token'] ? '[HIDDEN]' : 'undefined'
      }
    });

    console.log('📡 Making API request...');
    
    // Make API request
    const response = await axios.request(config);
    
    console.log('✅ Response received successfully!');
    console.log('📊 Response Status:', response.status);
    console.log('📊 Response Headers:', response.headers);
    console.log('📊 Response Data:', JSON.stringify(response.data, null, 2));
    
    // Handle success responses (200, 201)
    if ([200, 201].includes(response.status)) {
      console.log('✅ SUCCESS PATH: Status code is 200 or 201');
      const successResult = {
        success: true,
        data: response.data,
        status: response.status
      };
      console.log('✅ Returning success result:', successResult);
      return successResult;
    } else {
      console.log('⚠️ UNEXPECTED STATUS PATH: Status code is not 200 or 201');
      const unexpectedResult = {
        success: false,
        error: 'Unexpected response status',
        status: response.status,
        data: response.data
      };
      console.log('⚠️ Returning unexpected status result:', unexpectedResult);
      return unexpectedResult;
    }

  } catch (error) {
    console.log('❌ ERROR CAUGHT in apiRequest');
    console.log('❌ Error name:', error.constructor.name);
    console.log('❌ Error message:', error.message);
    console.log('❌ Full error:', error);
    
    // Handle different types of errors
    if (error.response) {
      // Server responded with error status
      console.log('🔴 SERVER ERROR RESPONSE');
      console.log('🔴 Error Response Status:', error.response.status);
      console.log('🔴 Error Response Data:', error.response.data);
      console.log('🔴 Error Response Headers:', error.response.headers);
      
      const serverErrorResult = {
        success: false,
        error: error.response.data?.message || 'Server error',
        status: error.response.status,
        data: error.response.data
      };
      console.log('🔴 Returning server error result:', serverErrorResult);
      if(serverErrorResult.status===403&&serverErrorResult.success===false){
        const guestUserResponse = await createGuestUser();
        if (guestUserResponse.status) {
          alert("Success","Session recovery complete.")
        }else{
          alert("error","Session recovery failed.")
        }
      }
      return serverErrorResult;
      
    } else if (error.request) {
      // Network error
      console.log('🌐 NETWORK ERROR');
      console.log('🌐 Error Request:', error.request);
      
      const networkErrorResult = {
        success: false,
        error: 'Network error - please check your connection',
        status: null
      };
      console.log('🌐 Returning network error result:', networkErrorResult);
      return networkErrorResult;
      
    } else {
      // Other errors
      console.log('⚡ OTHER ERROR');
      console.log('⚡ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      const otherErrorResult = {
        success: false,
        error: error.message || 'An unexpected error occurred',
        status: null
      };
      console.log('⚡ Returning other error result:', otherErrorResult);
      return otherErrorResult;
    }
  }
};

const apiHelper = {
  get: (url, headers = {}) => {
    console.log('🔍 GET request initiated');
    return apiRequest({ url, method: 'GET', headers });
  },
  
  post: (url, body, headers = {}) => {
    console.log('📝 POST request initiated');
    return apiRequest({ url, method: 'POST', body, headers });
  },
  
  put: (url, body, headers = {}) => {
    console.log('🔄 PUT request initiated');
    return apiRequest({ url, method: 'PUT', body, headers });
  },
  
  patch: (url, body, headers = {}) => {
    console.log('🔧 PATCH request initiated');
    return apiRequest({ url, method: 'PATCH', body, headers });
  },
  
  delete: (url, headers = {}) => {
    console.log('🗑️ DELETE request initiated');
    return apiRequest({ url, method: 'DELETE',body, headers });
  }
};

export default apiHelper;

// Example usage with detailed logging:
/*
import api from './apiUtil';

// GET request with logging
const fetchData = async () => {
  console.log('=== 🎯 Starting GET request example ===');
  const result = await api.get('https://api.example.com/data');
  
  console.log('=== 🎯 GET request completed ===');
  console.log('Final result:', result);
  
  if (result.success) {
    console.log('✅ GET SUCCESS - Data:', result.data);
  } else {
    console.log('❌ GET FAILED - Error:', result.error, 'Status:', result.status);
  }
};

// POST request with logging
const createData = async () => {
  console.log('=== 🎯 Starting POST request example ===');
  const body = { name: 'Test', email: 'test@example.com' };
  const result = await api.post('https://api.example.com/users', body);
  
  console.log('=== 🎯 POST request completed ===');
  console.log('Final result:', result);
  
  if (result.success) {
    console.log('✅ POST SUCCESS - Created:', result.data);
  } else {
    console.log('❌ POST FAILED - Error:', result.error, 'Status:', result.status);
  }
};

// Custom headers with logging
const customRequest = async () => {
  console.log('=== 🎯 Starting custom headers request example ===');
  const result = await api.get('https://api.example.com/data', {
    'Custom-Header': 'value'
  });
  
  console.log('=== 🎯 Custom request completed ===');
  console.log('Final result:', result);
  
  if (result.success) {
    console.log('✅ CUSTOM SUCCESS - Data:', result.data);
  } else {
    console.log('❌ CUSTOM FAILED - Error:', result.error);
  }
};

// Test your specific case
const testYourCase = async () => {
  console.log('=== 🎯 Testing your specific case ===');
  
  // Replace with your actual URL and body
  const body = {
    // your request body here
  };
  
  const result = await api.post('your-api-url-here', body);
  
  console.log('=== 🎯 Your test completed ===');
  console.log('Final result received in calling function:', result);
  
  if (result.success) {
    console.log('✅ YOUR SUCCESS - Data:', result.data);
    console.log('✅ Status code:', result.status);
  } else {
    console.log('❌ YOUR FAILED - Error:', result.error);
    console.log('❌ Status code:', result.status);
  }
};
*/