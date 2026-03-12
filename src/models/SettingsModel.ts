

export interface SettingsModel {
    id: number;
    store_name: string;
    email: string;
    phone: string;
    address: string;
    logo: string | null;
    created_at: Date;
    updated_at: Date;
  }
  
  export interface PaymentMethodModel {
    id: number;
    bank_name: string;
    account_name: string;
    account_number: string;
    is_active: boolean;
    created_at: Date;
  }

  export interface UpdateSettingsInput {
    store_name: string;
    email: string;
    phone: string;
    address: string;
    logo?: string;
  }

  export interface CreatePaymentMethodInput {
    bank_name: string;
    account_name: string;
    account_number: string;
  }

  export interface SettingsResponse {
    settings: SettingsModel;
    payments: PaymentMethodModel[];
  }