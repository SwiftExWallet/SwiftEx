import { NativeModules, Platform } from 'react-native';
const { StorageModule } = NativeModules;

class AccessNativeStorage {
    async saveWallet(walletValue) {
        try {
            if (!StorageModule) {
                throw new Error('StorageModule not available');
            }
            const Id=Math.floor(1000 + Math.random() * 9000).toString();
            const value = {
                ...walletValue,
                walletId:Id
            };
            if(Platform.OS==="ios"){

                const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                const saveResponse = await StorageModule.saveWallet(stringValue);
                if(saveResponse.success){
                    await this.updateActiveWallet(Id.toString())
                }
                return saveResponse;
            } else {
                const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                const saveResponse = await StorageModule.saveWallet(stringValue);
                if (saveResponse.success) {
                    await this.updateActiveWallet(Id.toString())
                }
                return saveResponse;
            }
        } catch (error) {
            console.error("error while save wallet: ", error);
            throw new Error(error);
        }
    }

    async getAllWallets(parseJSON = true) {
        if (!StorageModule) {
            throw new Error('StorageModule not available');
        }
        const result = await StorageModule.getAllWallets();
        if (!result.success || result.wallets === null) {
            return null;
        }
        if (parseJSON) {
            try {
                return JSON.parse(result.wallets);
            } catch (error) {
                return result.wallets;
            }
        }
        return result.wallets;
    }

    async getWalletAddress() {
        if (!StorageModule) {
            throw new Error('StorageModule not available');
        }
        const result = await StorageModule.getWalletAddress();
        if (!result.success) {
            return null;
        }
        return result;
    }

    async delete(key) {
        if (!StorageModule) {
            throw new Error('StorageModule not available');
        }
        const result = await StorageModule.delete(key);
        return result;
    }

    async walletRename(key,walletName) {
        if (!StorageModule) {
            throw new Error('StorageModule not available');
        }
        const result = await StorageModule.renameWallet(key,walletName);
        return result;
    }


    async clearAll() {
        if (!StorageModule) {
            throw new Error('StorageModule not available');
        }
        const result = await StorageModule.clearAll();
        return result.success;
    }

    async updateActiveWallet(key) {
        try {
            if (!StorageModule) {
                throw new Error('StorageModule not available');
            }
            const updateActiveResponse = await StorageModule.updateActiveWallet(key);
            return updateActiveResponse;
        } catch (error) {
            console.error("error while update wallet: ", error);
            throw new Error(error);
        }
    }
}
export default new AccessNativeStorage();