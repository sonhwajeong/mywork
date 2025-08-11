// Define your TypeScript types here

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export type Theme = 'light' | 'dark';

export interface NavigationProps {
  navigation: any;
  route: any;
}