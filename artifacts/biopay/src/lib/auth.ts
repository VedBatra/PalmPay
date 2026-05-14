export const getToken = () => localStorage.getItem("biopay_token");
export const getRole = () => localStorage.getItem("biopay_role");

export const setAuth = (token: string, role: string) => {
  localStorage.setItem("biopay_token", token);
  localStorage.setItem("biopay_role", role);
};

export const clearAuth = () => {
  localStorage.removeItem("biopay_token");
  localStorage.removeItem("biopay_role");
};
