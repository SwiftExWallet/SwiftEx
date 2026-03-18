import React, { useState, useRef, useEffect } from "react";
import {
  SafeAreaView,
  StyleSheet,
  View,
  StatusBar,
  TouchableOpacity,
  Text,
  TextInput,
  DeviceEventEmitter,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
  Alert,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import { Button, ActivityIndicator, Image, Platform } from "react-native";
import title_icon from "../../../../../../../assets/title_icon.png";
import darkBlue from "../../../../../../../assets/darkBlue.png";
import { LinearGradient } from "react-native-linear-gradient";
import { useDispatch } from "react-redux";
import PhoneInput from "react-native-phone-number-input";
import { getAuth, login, saveToken, verifyLoginOtp } from "../../api";
import { useFocusEffect, useIsFocused, useNavigation } from "@react-navigation/native";
import {OtpInput} from "react-native-otp-entry";
import { ShowErrotoast, Showsuccesstoast, alert } from "../../../../../reusables/Toasts";
import { ExchangeHeaderIcon } from "../../../../../header";
import AsyncStorageLib from "@react-native-async-storage/async-storage";
import { REACT_APP_HOST } from "../../ExchangeConstants";
import { useToast } from "native-base";
import { Exchange_Login_screen } from "../../../../../reusables/ExchangeHeader";
import Snackbar from "react-native-snackbar";
import authApi from "../../authApi";
import apiHelper from "../../apiHelper";

export const ExchangeLogin = (props) => {
  const toast=useToast();
  const [VERFIY_OTP, setVERFIY_OTP] = useState(false);
  const [formattedValue, setFormattedValue] = useState("");
  const [valid, setValid] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const phoneInput = useRef(null);
  const [loading, setLoading] = useState(false);
  const [Message, setMessage] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otp, setOtp] = useState();
  const dispatch = useDispatch();
  const [Email, setEmail] = useState("");
  const [passcode_view, setpasscode_view] = useState(false);
  const [passcode, setpasscode] = useState("");
  const [con_passcode, setcon_passcode] = useState("");
  const [disable, setdisable] = useState(true);
  const [login_Passcode,setlogin_Passcode]=useState("");
  const [active_forgot,setactive_forgot]=useState(false);
  const [Loading_fog,setLoading_fog]=useState(false);
  const [lodaing_ver,setlodaing_ver]=useState(false);
  const navigation = useNavigation();
const FOCUSED=useIsFocused();
  const [reset_otp,setreset_otp]=useState(true);
  const [count, setCount] = useState(30);
  const [resend_view,setresend_view]=useState(true);
  const otpHandler = (message) => {
    try {
      if (message) {
        console.log("the message is : ", message);
        let otp = /(\d{6})/g.exec(message)[1];
        setOtp(otp);
        console.log(otp);
      }
    } catch (e) {
      console.log(e);
    }
  };

  const removeListener = () => {
    if (Platform.OS === "android") {
      // RNOtpVerify.removeListener();
      console.log("removed listener");
    }
  };

  // const submitPhoneNumber = async () => {
    // try {
    //   // if (!value) {
    //   //   return setMessage("phone number is required to proceed");
    //   // }

    //   console.log('formatted value', formattedValue);
    //   const { err } = await login({ email: `${Email}` });
    //   if (err) {
    //     return setMessage(err.message);
    //   }
    //   setMessage("OTP is sent");
    //   setIsOtpSent(true);
    // } catch (err) {
    //   console.log(err)
    //   setMessage(err.message);
    // } finally {
    //   setLoading(false);
    // }
  // };

 const save_token_inlocal=async(token_new)=>{
  try {
    await AsyncStorageLib.setItem("UserAuthID", token_new) 
    setLoading(false);
    setEmail("");
    setlogin_Passcode("");
    if(props?.route?.params?.diractPath==="rampScreen")
    {
      navigation.navigate("KycComponent");
      Showsuccesstoast(toast,"Success");
    }
    else{
      navigation.navigate("Settings");
      Showsuccesstoast(toast,"Success");
    }
  } catch (error) {
    console.log("----===",error)
  }
 }

  const submitPhoneNumber = async () => {
     if(!Email||!login_Passcode)
     {
      setTimeout(()=>{
      ShowErrotoast(toast,"Both fields are required");
      },400)
      setEmail("");
      setlogin_Passcode("");
      setLoading(false)
     }
     else{
      const result = await apiHelper.post(REACT_APP_HOST + "/v1/auth/login", {
        "username": Email.toLowerCase(),
        "password": login_Passcode
      });
      console.log("result",result)
      if (result.success&&result.data.token) {
        setLoading(false);
       await save_token_inlocal(result.data.token)
      }
      else{
        alert("error",result?.data?.message||"somthing went wrong..");
        setLoading(false);
      }
    }

  }

  const submitOtp = async () => {
    try {
      if (!otp) {
        setTimeout(()=>{
          ShowErrotoast(toast,"OTP is required");
        },400)
        return setMessage("OTP is required");
      }
      const { err } = await verifyLoginOtp({
        email: `${Email.toLowerCase()}`,
        otp: otp,
      });
      if (err) {
        setMessage(err.message);
        setTimeout(()=>{
          ShowErrotoast(toast,"Wrong OTP");
        },400)
        setOtp(null);
      } else {
        // setpasscode_view(true);
        navigation.navigate("Setup_password",{Email:Email})
        setOtp(null);
        setIsOtpSent(false);
        setMessage("");
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitpasscode = async () => {
    const token = await getAuth();
   const len=passcode.length;
   const len0=con_passcode.length;

    if (!passcode || !con_passcode) {
      setLoading(false);
      setcon_passcode("");
      setpasscode("");
      setTimeout(()=>{
        ShowErrotoast(toast,"Both fields are required");
      },400)
    }
    else {
      //  if(len>8||len0>8)
      //  {
        const result = passcode === con_passcode;
        if (result === true) {
          const myHeaders = new Headers();
          myHeaders.append("Content-Type", "application/json");
          myHeaders.append("Authorization", "Bearer " + token);
          const raw = JSON.stringify({
            "email": Email.toLowerCase(),
            "passcode": con_passcode
          });
          const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: raw,
            redirect: "follow"
          };
  
          fetch(REACT_APP_HOST + "/users/updatePasscode", requestOptions)
            .then((response) => response.json())
            .then((result) => {
              setLoading(false);
              if (result.success === true) {
                setpasscode_view(false);
                setpasscode("");
                setcon_passcode("");
                setTimeout(()=>{
                  Showsuccesstoast(toast,"Choose a subscription and hold for more information.");
                },400)
                setIsOtpSent(false);
                navigation.navigate("Subscription");
              } else {
                setpasscode("");
               setcon_passcode("");
               setTimeout(()=>{
                ShowErrotoast(toast,"Something went worng.");
               },400)
              }
            })
            .catch((error) => {
              setLoading(false);
              console.log(error)
            });
        }
        else {
          setLoading(false);
          setpasscode("");
          setcon_passcode("");
          setTimeout(()=>{
            ShowErrotoast(toast,"Password Not Match.");
          },400)
        }
      //  }
      //  else{
      //   setLoading(false);
      //   setpasscode("");
      //   setcon_passcode("");
      //   alert("error","Password min length Eight.")
      //  }  
    }

  }

  const forgot_pass=()=>{
      setactive_forgot(true);
      setlodaing_ver(false);
      setVERFIY_OTP(false)
  }

  const get_otp_forget = async () => {

    setVERFIY_OTP(true);
    Keyboard.dismiss()
    setlodaing_ver(true);
    setLoading_fog(true);
    if (Email.length<0) {
      setlodaing_ver(false);
       setLoading_fog(false);
       setTimeout(()=>{
        ShowErrotoast(toast,"Email reqired.");
       },400)
      setVERFIY_OTP(false);
    } else {
      try {
        const result = await apiHelper.post(REACT_APP_HOST + "/v1/auth/forgot-password", {
          "email": Email.toLowerCase()
        });
        console.log("result:--",result)
        if (result.data.success) {
          setlodaing_ver(false);
          setLoading_fog(true);
          setTimeout(() => {
            Showsuccesstoast(toast, "OTP sent successfully in your mail.");
          }, 400)
          setLoading_fog(false);
          setVERFIY_OTP(false);
          setLoading(false);
          navigation.navigate("Exchange_otp", {
            Email: Email.toLowerCase(),
            type: "OP_FUG"
          });

        }
        if (result.data.error) {
          setLoading(false);
          setLoading_fog(false);
          setVERFIY_OTP(false);
          if (Array.isArray(result?.data?.error?.message)) {
            Snackbar.show({
              text: result?.data?.message[0] === "email must be an email" ? "Email must be an email" : result?.message[0],
              duration: Snackbar.LENGTH_SHORT,
              backgroundColor: 'red',
            });
            setlodaing_ver(false);
            setLoading_fog(true);
            setEmail("");
            setLoading_fog(false);
            setVERFIY_OTP(false);
            setLoading(false);
          } else {
            ShowErrotoast(toast, result.message);
            setlodaing_ver(false);
            setLoading_fog(true);
            setEmail("");
            setLoading_fog(false);
            setVERFIY_OTP(false);
            setLoading(false);
          }

        }
      } catch (err) {
        setLoading(false);
        setLoading_fog(false);
         setLoading_fog(true);
        setMessage(err.message);
        setLoading_fog(false);
      } finally {
        setLoading(false);
        setLoading_fog(false);
        setLoading_fog(true);
        setLoading(false);
        setLoading_fog(false);
      }
    }
    setLoading_fog(false);
  }

  const HideKeyboard = ({ children }) => (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss()}>
      {children}
    </TouchableWithoutFeedback>
  );

  useEffect(() => {
    console.log("focus changed");
    try {
      if (props.route.params) {
        if (props.route.params.phoneNumber) {
          setIsOtpSent(true);
          const phoneNumber = props.route.params.phoneNumber;
          if (phoneNumber) {
            setEmail(phoneNumber);
            console.log(Email);
            setIsOtpSent(true);
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
  },[]);

  useEffect(() => {
    setreset_otp(false)
    setresend_view(true)
    setCount(30)
    setLoading(false);
    setactive_forgot(false);
    try {
      if (props.route.params) {
        if (props.route.params.phoneNumber) {
          console.log(props.route.params.phoneNumber);
          setIsOtpSent(true);
          const phoneNumber = props.route.params.phoneNumber;
          if (phoneNumber) {
            setEmail(phoneNumber);
            setIsOtpSent(true);
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
  }, [FOCUSED]);

  useEffect(() => {
    if (Platform.OS === "android") {
      if (isOtpSent) {
        try {
          // RNOtpVerify.getOtp()
          //   .then((p) => RNOtpVerify.addListener(otpHandler))
          //   .catch((error) => {
          //     console.log(error);
          //   });
        } catch (e) {
          console.log(e);
        }
      }
    }

    return () => removeListener();
  }, [isOtpSent,FOCUSED]);
  const onChangepass = (input) => {
    const formattedInput = input.replace(/\s/g, '');
    setpasscode(formattedInput);
    // setcon_passcode
    // onChangeconpass
  };
  const onChangeconpass = (input) => {
    const formattedInput = input.replace(/\s/g, '');
    setcon_passcode(formattedInput);
  };
  const onChangelmail = (input) => {
    setEmail(input)
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prevCount) => {
        if (prevCount > 0) {
          return prevCount - 1;
        } else {
          clearInterval(interval);
          setresend_view(false);
          return 0;
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [reset_otp]);

  const resend_otp=async()=>{
    setreset_otp(true)
    setCount(30)
    setresend_view(true);
    await get_otp_forget()
  }
  return (
    <>
     {/* {lodaing_ver==true?alert("success","Email Verifying...."):<></>} */}
    <Exchange_Login_screen title="" onLeftIconPress={() => navigation.navigate("Home")} />
      <SafeAreaView style={styles.container}>
        <TouchableWithoutFeedback id="keybordDismissBtn"
testID="keybordDismissBtn" onPress={()=>{Keyboard.dismiss()}}
          // style={styles.container}
          // onStartShouldSetResponder={() => Keyboard.dismiss()}
        >
          {isOtpSent === false ? (
            <View style={styles.content}>
              <View style={{ marginTop: hp(1), borderRadius: hp(2) }}>
                <Image style={styles.tinyLogo} source={darkBlue} />

                <Text style={styles.text}>Hi, Welcome Back! 👋</Text>
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 19,
                    textAlign: "center",
                    marginTop: hp(1),
                    marginBottom: hp(3),
                  }}
                >
                  {active_forgot===true?"Recover to your account":"Login to your account"}
                </Text>
               <Text style={{
                    color: "#FFFFFF",
                    fontSize: 16,
                    textAlign: 'left',
                    paddingVertical:5,
                    fontWeight:"500"
                  }}>Email</Text>
                <TextInput id="emailLoginInput" testID="emailLoginInput" accessibilityLabel="textInputId" autoCapitalize="none" textContentType="emailAddress" placeholder={"Email Adderss"} placeholderTextColor={"gray"} style={{ backgroundColor: "white", padding: 16, borderRadius: 5, fontSize: 16,color:"black" }} value={Email} onChangeText={(text) => { onChangelmail(text) }} />
                {active_forgot===false?
                <>
                 <Text style={{fontWeight:"500",color: "#FFFFFF",fontSize: 16,textAlign: 'left',paddingVertical:5,marginTop:10}}>Password</Text>
                <TextInput autoCapitalize="none" placeholder={"Password"} placeholderTextColor={"gray"} style={{ backgroundColor: "white", padding: 16, borderRadius: 5, fontSize: 16,marginTop:5,color:"black" }} value={login_Passcode} onChangeText={(text) => { setlogin_Passcode(text) }} secureTextEntry={true} /></>:<></>}                
                <TouchableOpacity id="forgotAndLoginBtn" testID="forgotAndLoginBtn" style={{alignSelf:"flex-end",marginTop:15}} onPress={()=>{active_forgot===false?forgot_pass():[setactive_forgot(false),setEmail("")]}}>
                {active_forgot===false?<Text style={{color:"red",fontWeight:"300",fontSize:15,fontWeight:"400"}}>Forgot Password</Text>:<Text style={{color:"red",fontWeight:"300",fontSize:15,fontWeight:"400"}}>Login</Text>}
                </TouchableOpacity>
                {loading ? (
                <View style={{ marginTop: 5 }}>
                  <ActivityIndicator size="large" color="white" />
                </View>
              ) : (
                <Text> </Text>
              )}
                <TouchableOpacity style={styles.PresssableBtn}
                id="LoginAndVerifyBtn"
                testID="LoginAndVerifyBtn"
                disabled={VERFIY_OTP}
                  onPress={() => {
                    if (active_forgot === false) {
                      setLoading(true);
                      try {
                        setMessage("Your Mail is valid");
                        submitPhoneNumber();
                      } catch (e) {
                        setLoading(true);
                        console.log(e);
                        setTimeout(()=>{
                          ShowErrotoast(toast,e)
                        },400)
                      }
                      setShowMessage(true);
                      Keyboard.dismiss();
                    }
                    else{
                      get_otp_forget();
                    }
                  }}
                >

                  {/* <LinearGradient
                    colors={["#12c2e9", "#c471ed", "#f64f59"]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.button}
                  > */}
                    <Text style={{ color: "white",fontWeight:"bold",fontSize:19 }}>{active_forgot===false?"Login":lodaing_ver===false?"Verify":<ActivityIndicator color={"white"}/>}</Text>
                  {/* </LinearGradient> */}
                </TouchableOpacity>
                {/* {showMessage ? (
                  <Text
                    style={{
                      color: "white",
                      textAlign: "center",
                      marginTop: hp(2),
                    }}
                  >
                    {Message}
                  </Text>
                ) : (
                  <Text></Text>
                )} */}
                {/* <TouchableOpacity style={{alignSelf:"center",marginTop:15}} onPress={()=>{active_forgot===false?forgot_pass():[setactive_forgot(false),setEmail("")]}}>
                {active_forgot===false?<Text style={{color:"white"}}>Forgot Password</Text>:<Text style={{color:"white"}}>Login</Text>}
                </TouchableOpacity> */}
              </View>

              

              <View style={{
    marginTop: hp(0.1),
    height: hp(5),
    width: 400,
    display: "flex",
    alignItems: "center",
    textAlign: "center",
    justifyContent: "center",
  }}>
                <TouchableOpacity
                id="RegisterBtn"
                testID="RegisterBtn"
                  onPress={() => {
                    navigation.navigate("exchangeRegister");
                  }}
                >
                  <Text style={styles.lowerboxtext}>
                    <Text style={{ color: "#78909c" }}>
                      Don't have an account?
                    </Text>{" "}
                    Register now
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.content}>
              <View>
                <Image style={styles.tinyLogo} source={darkBlue} />
              </View>

              <Text
                style={{ color: "#FFFFFF", marginBottom: 20, fontSize: 16 }}
              >
                Setup Exchange Account
              </Text>

              <View style={{ marginVertical: 3 }}>
                {passcode_view === false ? <><Text style={{ marginVertical: 15, color: "white" }}>Verification OTP</Text>
                  <TextInput
                  id="oneTimeCodeInput"
                  testID="oneTimeCodeInput"
                    placeholderTextColor="gray"
                    style={[styles.input,{color:"black",backgroundColor:"#fff"}]}
                    theme={{ colors: { text: "white" } }}
                    value={otp}
                    placeholder={"OTP"}
                    onChangeText={(text) => {
                      console.log(text);
                      setOtp(text);
                    }}
                    autoComplete={"sms-otp"}
                    textContentType={"oneTimeCode"}
                    keyboardType={"number-pad"}
                    maxLength={6}
                  /></> : <>{/* Set pass code  */}
                  <Text style={{ marginVertical: 15, color: "white" }}>Password</Text>
                  <TextInput
                  id="fistPasswordInput"
                  testID="fistPasswordInput"
                  secureTextEntry={true}
                    placeholderTextColor="gray"
                    style={[styles.input,{color:"black",backgroundColor:"#fff"}]}
                    // theme={{ colors: { text: "white" } }}
                    value={passcode}
                    placeholder={"ABC@!123"}
                    onChangeText={(text) => {
                      onChangepass(text)
                    }}
                    autoCapitalize="none"
                    keyboardType="default"
                  />
                  {/* Set con-pass code  */}
                  <Text style={{ marginVertical: 15, color: "white" }}>Confirm Password</Text>
                  <TextInput
                    id="secondPasswordInput"
                    testID="secondPasswordInput"
                    secureTextEntry={true}
                    placeholderTextColor="gray"
                    style={[styles.input,{color:"black",backgroundColor:"#fff"}]}
                    // theme={{ colors: { text: "white" } }}
                    value={con_passcode}
                    placeholder={"ABC@!123"}
                    onChangeText={(text) => {
                      onChangeconpass(text);
                    }}
                    autoCapitalize="none"
                    keyboardType="default"
                  /></>}
               {passcode_view===false>0?<></>:passcode.length<8||con_passcode.length<8?<Text style={{color:"#B51E14",marginTop:6}}>Your password must be at least 8 characters long.</Text>:<></>}
              </View>
              {/* <View style={{ marginTop: 10 }}>
                {showMessage ? (
                  <Text style={{ color: "white" }}>{Message}</Text>
                ) : (
                  <Text></Text>
                )}
              </View> */}

              {loading ? (
                <ActivityIndicator size="large" color="white" />
              ) : (
                <Text> </Text>
              )}

<TouchableOpacity
id="submitOtpOrsubmitpasscodeBtn"
testID="submitOtpOrsubmitpasscodeBtn"
  disabled={passcode_view===false?false:passcode.length<8||con_passcode.length<8?true:false}
  onPress={() => {
    setLoading("true");
    { passcode_view === false ? submitOtp() : submitpasscode() }
    Keyboard.dismiss()
  }}
  style={styles.PresssableBtn}
>
              {/* <LinearGradient
                colors={["#12c2e9", "#c471ed"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 1 }}
                style={styles.verifyBtn}
              > */}
                  <Text style={styles.buttonText}>Verify</Text>
              {/* </LinearGradient> */}
                </TouchableOpacity>
              {/* <TouchableOpacity onPress={() => { navigation.navigate("exchangeLogin") }}> */}
            {passcode_view === false? <View style={{flexDirection:"row", width:"90%",justifyContent:"center"}}>
             <TouchableOpacity id="EditEmailIdBtn"
testID="EditEmailIdBtn" onPress={() => { navigation.goBack() }}>
                <Text style={{ marginTop: 14, color: "white" }}>Edit Email Id</Text>
              </TouchableOpacity>
              <TouchableOpacity id="resendOtpBtn"
testID="resendOtpBtn" disabled={resend_view} onPress={() => {resend_otp()}}>
                <Text style={{ marginLeft:19,marginTop: 14, color: resend_view?"gray":"white" }}>{resend_view?`Resend after: ${count}`:"Resend OTP"}</Text>
              </TouchableOpacity>
             </View>:<></>}
            </View>
          )}
        </TouchableWithoutFeedback>
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  input: {
    paddingVertical: hp(1),
    paddingLeft: wp(7),
    color: "#fff",
    width: wp("84"),
    borderRadius: hp(1),
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "gray",
  },
  content: {
    display: "flex",
    alignItems: "center",
    textAlign: "center",
    // justifyContent: "space-evenly",
    marginTop:0,
    color: "white",
  },

  btn: {
    marginTop: hp("10"),
    width: wp("80"),
    borderRadius: 380,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  icon: {
    display: "flex",
    flexDirection: "row",
    marginTop: hp("10"),
    marginLeft: wp("15"),
  },
  text: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    // paddingVertical: 10,
    textAlign: "center",
  },
  tinyLogo: {
    width: wp("20"),
    height: hp("13"),
    marginTop: hp(5),
    alignSelf: "center",
  },
  icon: {
    display: "flex",
    flexDirection: "row",
    marginTop: hp("2"),
    marginLeft: wp("4"),
  },
  icon2: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginTop: hp("5"),
    paddingLeft: wp("2"),
  },
  button: {
    marginTop: hp(10),
    width: wp(80),
    borderRadius: hp(1),
    paddingVertical: hp(1.5),
    alignItems: "center",
  },
  PresssableBtn: {
    backgroundColor: "rgba(33, 43, 83, 1)rgba(28, 41, 77, 1)",
    padding: hp(2),
    width: wp(80),
    borderColor:"rgba(72, 93, 202, 1)rgba(67, 89, 205, 1)",
    borderWidth:1.3,
    alignSelf: "center",
    paddingHorizontal: wp(3),
    borderRadius: hp(2.5),
    marginBottom: hp(1),
    alignItems: "center",
    marginTop:hp(10),
  },
  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 18,
  },
  
  lowerboxtext: {
    fontSize: 16,
    color: "#FFFFFF",
    textAlign: "center",
    alignSelf: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#131E3A",
    height: 10,
    color: "#fff",
  },
  container2: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  box: {
    width: 300,
    height: 55,
    marginVertical: 20,
    borderColor: "red",
    borderWidth: 1,
  },
  verifyBtn: {
    backgroundColor: "red",
    width: wp(85),
    paddingVertical: hp(1),
    borderRadius: hp(1),
    marginTop: hp(10),
  },
});

