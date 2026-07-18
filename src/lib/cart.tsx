import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  menu_item_id: string;
  name: string;
  price_cents: number;
  quantity: number;
  image_url: string | null;
};

export type CartState = {
  vendor_id: string | null;
  vendor_slug: string | null;
  items: CartItem[];
  slot_id: string | null;
};

const EMPTY: CartState = { vendor_id: null, vendor_slug: null, items: [], slot_id: null };
const STORAGE_KEY = "slotpass.cart";

type Ctx = {
  cart: CartState;
  addItem: (vendor: { id: string; slug: string }, item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQuantity: (menu_item_id: string, quantity: number) => void;
  setSlot: (slot_id: string | null) => void;
  clear: () => void;
  totalCents: number;
  totalItems: number;
};

const CartCtx = createContext<Ctx>({
  cart: EMPTY,
  addItem: () => {},
  setQuantity: () => {},
  setSlot: () => {},
  clear: () => {},
  totalCents: 0,
  totalItems: 0,
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>(EMPTY);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) setCart(JSON.parse(raw) as CartState);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const value = useMemo<Ctx>(() => {
    const totalItems = cart.items.reduce((s, i) => s + i.quantity, 0);
    const totalCents = cart.items.reduce((s, i) => s + i.quantity * i.price_cents, 0);
    return {
      cart,
      totalItems,
      totalCents,
      addItem(vendor, item, qty = 1) {
        setCart((prev) => {
          const switching = prev.vendor_id && prev.vendor_id !== vendor.id;
          const base: CartState = switching || !prev.vendor_id
            ? { vendor_id: vendor.id, vendor_slug: vendor.slug, items: [], slot_id: null }
            : prev;
          const existing = base.items.find((i) => i.menu_item_id === item.menu_item_id);
          const items = existing
            ? base.items.map((i) => (i.menu_item_id === item.menu_item_id ? { ...i, quantity: i.quantity + qty } : i))
            : [...base.items, { ...item, quantity: qty }];
          return { ...base, items };
        });
      },
      setQuantity(menu_item_id, quantity) {
        setCart((prev) => {
          const items = prev.items
            .map((i) => (i.menu_item_id === menu_item_id ? { ...i, quantity } : i))
            .filter((i) => i.quantity > 0);
          if (items.length === 0) return EMPTY;
          return { ...prev, items };
        });
      },
      setSlot(slot_id) {
        setCart((prev) => ({ ...prev, slot_id }));
      },
      clear() {
        setCart(EMPTY);
      },
    };
  }, [cart]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export const useCart = () => useContext(CartCtx);