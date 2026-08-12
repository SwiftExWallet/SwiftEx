import React, { FC, ReactElement, useState } from "react";
import {widthPercentageToDP as wp, heightPercentageToDP as hp} from 'react-native-responsive-screen';
import { Button, StyleSheet,  View,ActivityIndicator, Text, Image, TouchableOpacity} from "react-native";
import Icon from 'react-native-vector-icons/FontAwesome'
import title_icon from '../../assets/title_icon.png'
import { TextInput } from 'react-native-paper';
import { LinearGradient } from 'react-native-linear-gradient';
import { useDispatch } from "react-redux";
import { login } from "../components/Redux/actions/auth";
import AsyncStorageLib from "@react-native-async-storage/async-storage";

export  const LoginPage = ({ navigation }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [text, setText] = useState('');
  const[loading, setLoading]= useState(false)
  const [passwordVisible, setPasswordVisible] = useState(true);

  function ValidateEmail(mail) 
  
  {
    setLoading(true)
   if (/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(mail))
    {
      
      return (true)
    }
    
      alert("You have entered an invalid email address!")
      return (false)
  }

    const dispatch = useDispatch();
  const onLogin =  () => {
    setLoading(true)
    if(!username||!password){
      setLoading(false)
      return alert('all fields are necessarry')
    }
      let user = {
        username: username,
        password: password,
      };
      const valid=ValidateEmail(user.username)
      if(valid) {

        dispatch(login(user))
        .then((response) => {
          
          setLoading(false)
          console.log(response)
          
          if(response){
            if (response.status == 'Not Found') {
           
              alert('Please create an account first')
              setLoading(false)
            }
          if (response.status == 'verifyotp') {
           
            alert('please verify your account first')
          }
          if (response.status == "invalid") {
           
            alert('invalid credentials')
          }
          if (response.status == "success") {
            navigation.replace("HomeScreen");
            return response.token
          }
        }
          
          
        })
        .catch((error) => {
          setLoading(false)
          console.log(error)
          alert(error)
          
        });
      }
      else{
        setLoading(false)
        return
      }
    };
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
       <Text style={styles.text}>
      Welcome Back!
       </Text>
       <Text style={{color:'#FFFFFF',
       marginBottom:20,
       fontSize:16}}>
      Login to your account
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
        size={25}
       color="#FFF"
        />
       <Text style={{color:'#FFF', marginLeft:5}}>Password</Text>
    
      
      </View>
      <TextInput
      style={styles.input}
      theme={{colors: {text: 'white' }}}
      value={password}
      placeholder={"Password"}
      secureTextEntry={passwordVisible}
      right={<TextInput.Icon name={passwordVisible ? "eye" : "eye-off"}  onPress={() => setPasswordVisible(!passwordVisible)} />}
      onChangeText={(text) => setPassword(text)}
      placeholderTextColor="#FFF"
      autoCapitalize={"none"}
      />
      </View>
      <View  style={styles.icon2}>
      
      <Icon name="check-circle-o"
        size={25}
       color="#FFF"
        />
       <Text style={{color:'#FFF', marginLeft:wp('2'), paddingRight:wp('18'), marginRight:15}}>Remember me</Text>
        <Text style={{color:'#FFF'}}>Forgot Password?</Text>
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
        setLoading('true')
      setTimeout(() => {
        
       const token = onLogin()
       if(token){
       // dispatch(setToken(token))
       console.log(token)
       }
      }, 1);
      }}>
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
      
     
      </LinearGradient>
      </View>
      <View style={styles.lowerbox}>
      <TouchableOpacity onPress={()=>{
        navigation.navigate('RegisterScreen')
      }}>
      <Text style={styles.lowerboxtext}><Text style={{color:'#78909c'}}>Don't have an account?</Text> Register now</Text>
      </TouchableOpacity>
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
    width:wp('70'),
    paddingRight:wp('7'),
    backgroundColor:'#131E3A',
    borderRadius:wp('20'),
    marginLeft:wp('10'),

  },
  content: {
   display: 'flex',
   alignItems:'center',
   textAlign:'center',
   justifyContent:'space-evenly',
    marginTop:hp('10'),
    color:'white'
   
  },
  inp:{
    borderWidth:2,
    marginTop:hp('3'),
    color:'#FFF',
    borderRadius:20,
    borderColor:'#808080',
   width:wp('90')
  },
  btn:{
    marginTop:hp('10'),
    width:wp('80'),
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