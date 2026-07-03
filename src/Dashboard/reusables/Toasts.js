import Snackbar from 'react-native-snackbar';
import { Box, useToast } from 'native-base';
import { View,Text } from 'react-native';
import CustomInfoProvider from '../exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';


export const ShowToast = (toast,message)=>{
  //const toast = useToast()
  
    return (toast.show({
        placement: "top",
        render: () => {
            return <Box bg="emerald.500" px="2" py="1" rounded="sm" mb={5}>
                    {message}
                  </Box>;
          }
        })
    )

}

export const ShowErrotoast = (toast,message)=>{
  Snackbar.show({
    text: message,
    duration: Snackbar.LENGTH_SHORT,
    backgroundColor:'red',
});
}

export const Showsuccesstoast = (toast,message)=>{
    CustomInfoProvider.show("success","Hurray",message);
}

export function alert(type,message){
    console.log(String(message))
    if(typeof(message)!=String){
        message = String(message)
    }
    if(type=='success')
    {
        Snackbar.show({
            text: message,
            duration: Snackbar.LENGTH_SHORT,
            backgroundColor:'#4CA6EA',
            
        });
    }else{
        Snackbar.show({
            text: message,
            duration: Snackbar.LENGTH_SHORT,
            backgroundColor:'red'
        });
    }
    if(type=='error')
    {
        Snackbar.show({
            text: message,
            duration: Snackbar.LENGTH_LONG,
            backgroundColor:'red',
            
        });
    }
    if(type=='Success')
    {
        Snackbar.show({
            text: message,
            duration: Snackbar.LENGTH_SHORT,
            backgroundColor:'green',
        });
    }
        
}
