import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Modal from "react-native-modal";
import Icon from "../../icon";

const BottomSheetModal = ({
    isVisible,
    onClose,
    options,
    selectedValue,
    onSelect,
    theme,
    heading
}) => {
    return (
        <Modal
            isVisible={isVisible}
            onBackdropPress={onClose}
            onBackButtonPress={onClose}
            swipeDirection="down"
            onSwipeComplete={onClose}
            style={styles.modalCon}
        >
            <View style={[styles.modalContainer,{backgroundColor:theme.cardBg}]}>
                <Text style={[styles.chooseModalTitle,{color:theme.headingTx}]}>{heading}</Text>

                <FlatList
                    data={options}
                    keyExtractor={(item, index) => index.toString()}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => {
                                onSelect(item);
                                onClose();
                            }}
                            style={[styles.importTypeCon,{backgroundColor:theme.bg}]}
                        >
                            <View style={{ flexDirection: "row", alignItems: 'center' }}>
                                <Image source={{uri:item.logoURI}} style={{height:28,width:28}}/>
                                <Text style={[styles.importTypeTitle,{color:theme.headingTx}]}>{item.name}</Text>
                            </View>

                            {selectedValue === item.name && (
                                <Icon
                                    type="materialCommunity"
                                    name="check-circle-outline"
                                    size={24}
                                    color="green"
                                />
                            )}
                        </TouchableOpacity>
                    )}
                />
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalCon: {
        justifyContent: 'flex-end',
        margin: 0,
    },
    modalContainer: {
        backgroundColor: 'white',
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '50%',
    },
    chooseModalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
        textAlign: 'center',
    },
    importTypeCon: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal:15,
        borderRadius:14,
        marginBottom:10
    },
    importTypeTitle: {
        fontSize: 16,
        marginLeft: 15,
    },
});

export default BottomSheetModal;