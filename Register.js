import React, { FC, ReactElement, useEffect, useState } from "react";
import { Button, StyleSheet,  View, Text, Image, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView} from "react-native";
import Icon from 'react-native-vector-icons/FontAwesome'
import title_icon from './assets/title_icon.png'
import { TextInput } from 'react-native-paper';
import { LinearGradient } from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native'
import {widthPercentageToDP as wp, heightPercentageToDP as hp} from 'react-native-responsive-screen';
import PassMeter from "react-native-passmeter";
import validator from 'validator'
import { urls } from "./src/Dashboard/constants";
import { ScrollView } from "react-native-gesture-handler";
import AsyncStorageLib from "@react-native-async-storage/async-storage";


export const Register = (props) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [Cpassword, setCPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState('')
  const [platform, setPlatform] = useState('')
  const [text, setText] = useState('');
  const[loading, setLoading]= useState(false)
  const [passwordVisible, setPasswordVisible] = useState(true);
  const navigation= useNavigation()
  const MAX_LEN = 15
  const MIN_LEN = 6
  const PASS_LABELS = ["Too Short", "Weak", "Normal", "Strong", "Secure"];
function ValidateEmail(mail) 
  
  {
    setLoading(true)
   if (/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(mail))
    {
      
      return (true)
    }
    
      alert("You have entered an invalid email format!")
      return (false)
  }

  const validatePassword = (value) => {
 
    if (validator.isStrongPassword(value, {
      minLength: 6, minLowercase: 1,
      minUppercase: 1, minNumbers: 1, minSymbols: 1
    })) {
      setErrorMessage('Is Strong Password')
      return true
    } else {
      setErrorMessage('Is Not Strong Password')
      alert("password must contain atleast 1 uppercase, 1 lowercase, 1 number and 1 special character")
      return false
    }
  }
async function register(){
  setLoading(true)
  try{
  if(!username||!password||!Cpassword){
    setLoading(false)
    return alert('All fields are mandatory')
  }
  const valid=ValidateEmail(username)
  const validPassword = validatePassword(password)
  if(valid&&validPassword){
   if(Cpassword!==password){
    setLoading(false)
    return alert("passwords doesn't match")
   }
  }else{
    setLoading(false)
    return
  }
  }catch(error){
    setLoading(false)
  alert(error)
  }
  }

  useEffect(async ()=>{
    const platform = await AsyncStorageLib.getItem('platform')
    setPlatform(platform)
  },[])

  return (
    <>
    <KeyboardAvoidingView style={styles.container} behavior='height'>
    <ScrollView>
    <View style={{display: 'flex',
      alignItems:'center',
      textAlign:'center',
      justifyContent:'space-evenly',
      marginTop:platform==='ios'?hp(10):hp('1'),
      color:'white'
      }} >
      
    <View >
    <Image
    style={styles.tinyLogo}
    source={title_icon}
  />
    </View>
       <Text style={styles.text}>
      Welcome!
       </Text>
       <Text style={{color:'#FFFFFF',
       marginBottom:20,
       fontSize:16}}>
      Create your account
       </Text>
        
       <View style={styles.inp}>
       <View style={styles.icon}>
       <Icon name="envelope-o"
        size={20}
       color="#FFF"
        />
       <Text style={{color:'#FFF', marginLeft:5}}>Email</Text>
       </View>
       
      <TextInput
        style={styles.input}
        theme={{colors: {text: 'white' }}}
        value={username}
        placeholder={"Enter your email here"}
        onChangeText={(text) => setUsername(text)}
        autoCapitalize={"none"}
        placeholderTextColor="#FFF"
        
      />
      </View>
     
      <View style={styles.inp}>
      <View style={styles.icon}>
      <Icon name="lock"
        size={20}
       color="#FFF"
        />
       <Text style={{color:'#FFF', marginLeft:5}}>Password</Text>
    
      
      </View>
      <TextInput
      placeholderTextColor="#FFF"
        style={styles.input}
        theme={{colors: {text: 'white' }}}
        value={password}
        placeholder={"Password"}
        secureTextEntry={passwordVisible}
      right={<TextInput.Icon name={passwordVisible ? "eye" : "eye-off"}  onPress={() => setPasswordVisible(!passwordVisible)} />}
        onChangeText={(text) => setPassword(text)}
      />
      </View>
      <View style={{marginTop:hp('3'),padding: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
   }}>

      <PassMeter
        showLabels
        password={password}
        maxLength={MAX_LEN}
        minLength={MIN_LEN}
        labels={PASS_LABELS}
        
        
        />
        </View>
      <View style={styles.inp}>
      <View style={styles.icon}>
      <Icon name="lock"
        size={20}
       color="#FFF"
        />
       <Text style={{color:'#FFF', marginLeft:5}}>Confirm Password</Text>
    
      
      </View>
      <TextInput
      placeholderTextColor="#FFF"
      style={styles.input}
      theme={{colors: {text: 'white' }}}
      value={Cpassword}
      un
      placeholder={"Confirm Password"}
      secureTextEntry={passwordVisible}
      right={<TextInput.Icon name={passwordVisible ? "eye" : "eye-off"}  onPress={() => setPasswordVisible(!passwordVisible)} />}
      onChangeText={(text) => setCPassword(text)}
      />
      </View>
            
      <View  style={styles.btn}>
      <LinearGradient
      colors={['#12c2e9', '#c471ed', '#f64f59']}
        start={{x: 0, y: 0.5}}
        end={{x: 1, y: 1}}
        style={styles.button}
      >
      <TouchableOpacity onPress={ ()=>{
      const result = register()
       
      }}>
          <Text style={styles.buttonText}>{loading? <View ><ActivityIndicator size="small" color="white" /></View>:'Create my account'}</Text>
        </TouchableOpacity>
      
     
      </LinearGradient>
      </View>
      <View style={{display:props.route.params.wallet=='visible'?'flex':'none'}}> 

      <View style={styles.lowerbox}>
      <TouchableOpacity onPress={()=>{
        navigation.navigate('LoginScreen')
      }}>
      <Text style={styles.lowerboxtext}><Text style={{color:'#78909c'}}>Already have an account?</Text> login now</Text>
      </TouchableOpacity>
      </View>
        </View>
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
};
  const styles = StyleSheet.create({
    input: {
      height: hp('5%'),
      marginBottom: hp('2'),
      color:'#fff',
      marginTop:hp('1'),
      width:wp('70'),
      paddingRight:wp('7'),
      backgroundColor:'#131E3A',
      borderRadius:wp('20'),
      marginLeft:wp('10')
      
    },
    content: {
      display: 'flex',
      alignItems:'center',
      textAlign:'center',
      justifyContent:'space-evenly',
      marginTop:hp('1'),
      color:'white'
      
    },
    inp:{
      borderWidth:2,
      marginTop:hp('1'),
      color:'#FFF',
      borderRadius:20,
      borderColor:'#808080',
      width:wp('95')
      
    },
    btn:{
      width:wp('80'),
      borderRadius:380,
      overflow: 'hidden',
      backgroundColor:'rgba(0,0,0,0.8)',
      marginTop:hp(2)
      
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
      padding:20
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
      borderRadius: wp('10'),
    },
    buttonText: {
      color: '#fff',
      textAlign: 'center',
      fontSize: 24
    },
    lowerbox:{
      marginTop:hp(2),
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
      color:'#fff'
      
    }
  });
