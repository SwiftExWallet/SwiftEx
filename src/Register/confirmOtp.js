import React, { FC, ReactElement, useState } from "react";
import {widthPercentageToDP as wp, heightPercentageToDP as hp} from 'react-native-responsive-screen';
import { Button, StyleSheet,  View,ActivityIndicator, Text, Image, TouchableOpacity} from "react-native";
import Icon from 'react-native-vector-icons/FontAwesome'
import title_icon from '../../assets/title_icon.png'
import { TextInput } from 'react-native-paper';
import { LinearGradient } from 'react-native-linear-gradient';
import { useDispatch } from "react-redux";
import { confirmOtp } from "../components/Redux/actions/auth";

export  const ConfirmOtp = ({route, navigation }) => {
  const [OTP, setOtp] = useState("");
  const[loading, setLoading]= useState(false)

  const {emailId,wallet}= route.params;
  console.log(emailId)

    const dispatch = useDispatch();
  const onLogin =  () => {
if(!OTP){
  return alert('You must enter a value to proceed')
}
      let user = {
        emailId:emailId,
        OTP:OTP
      };
     
try{

  dispatch(confirmOtp(user))
  .then((response) => {
    
    setLoading(false)
    console.log(response)
    const res =  response
    if (res.status == "success") {
      if(wallet==='exists'){
        navigation.replace("Import",{
          emailId:emailId
        });
      }
    }
    if (res.status == "invalid") {
       setLoading(false)
      return  alert('invalid OTP')

    }
  })
  .catch((error) => {
    setLoading(false)
    console.log(error.responseMessage)
    alert('please provide valid details')
    
  });
  
  
}catch(error){
  console.log(error)
  alert(error)
}
}
  return (
    <>
    <View style={styles.container}>
    <View style={styles.content}>
    <View>
    <Image
    style={styles.tinyLogo}
    source={title_icon}
  />
    </View>
      
       <Text style={{color:'#FFFFFF',
       fontSize:20,
    marginTop:10}}>
     Validate Account
       </Text>
       <View style={styles.inp}>
       <View style={styles.icon}>
       <Icon name="envelope-o"
        size={20}
       color="#FFF"
        />
       <Text style={{color:'#FFF', marginLeft:5}}>Please enter the otp sent your email</Text>
       </View>
       
      <TextInput
        style={styles.input}
        theme={{colors: {text: 'white' }}}
        value={OTP}
        placeholder={"Enter your otp here"}
        onChangeText={(text) => setOtp(text)}
        autoCapitalize={"none"}
        placeholderTextColor="#FFF"
      />
      </View>
        {loading? <ActivityIndicator size="large" color="white" />:<Text> </Text>}

      <View  style={styles.btn}>
      <LinearGradient
      colors={['#12c2e9', '#c471ed', '#f64f59']}
        start={{x: 0, y: 0.5}}
        end={{x: 1, y: 1}}
        style={styles.button}
        >
      <TouchableOpacity onPress={()=> {
        setLoading(true)
      setTimeout(() => {
        
        onLogin()
      }, 1);
      }}>
          <Text style={styles.buttonText}>Confirm</Text>
        </TouchableOpacity>
      
     
      </LinearGradient>
      </View>
      </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  input: {
    height: hp('5%'),
    marginBottom: hp('2'),
    color:'#fff',
    marginTop:hp('2'),
    width:wp('60'),
    paddingLeft: wp('7'),
    paddingRight:wp('7'),
    backgroundColor:'#131E3A',
    borderRadius:wp('20')
   
  },
  content: {
   display: 'flex',
   alignItems:'center',
   textAlign:'center',
   justifyContent:'space-evenly',
    marginTop:hp('15'),
    color:'white'
   
  },
  inp:{
    borderWidth:2,
    marginTop:hp('8'),
    color:'#FFF',
    borderRadius:20,
    borderColor:'#808080',
    width:wp('70')
   
  },
  btn:{
    width:wp('60'),
    borderRadius:380,
    overflow: 'hidden',
    backgroundColor:'rgba(0,0,0,0.8)'

  },
  icon:{
    display:'flex',
    flexDirection:'row',
    marginTop:hp('10'),
    marginLeft:wp('15')
  },
  text:{
    color:'#FFFFFF',
    marginBottom:wp('5'),
    fontSize:hp('5')
  },
  tinyLogo: {
    width: wp('5'),
    height: hp('5'),
    padding:30
  },
  icon:{
    display:'flex',
    flexDirection:'row',
    marginTop:hp('2'),
    marginLeft:wp('4')
  },
  icon2:{
    display:'flex',
    flexDirection:'row',
    justifyContent:'space-evenly',
    marginTop:hp('5'),
    paddingLeft:wp('2'),
  },
  button: {
    paddingVertical: hp('2'),
    paddingHorizontal: wp('2'),
    borderRadius: wp('10')
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 24
  },
  lowerbox:{
    marginTop:40,
    height:100,
    width:400,
    backgroundColor:'#003166',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    display:'flex',
    alignItems:'center',
    textAlign:'center',
    justifyContent:'center'
  },
  lowerboxtext:{
    fontSize: 20,
    color:'#FFFFFF',
    textAlign:'center',
    alignSelf:'center'
  },
  container: {
    flex: 1,
    backgroundColor: '#131E3A',
    height:10,
    color:'#fff',
    
  }
});