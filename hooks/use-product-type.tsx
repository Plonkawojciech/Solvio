'use client'

import { createContext, useContext } from 'react'
import type { ProductType } from '@/lib/product-type'

interface ProductTypeContextValue {
  productType: ProductType
  isPersonal: boolean
  isBusiness: boolean
}

const ProductTypeContext = createContext<ProductTypeContextValue>({
  productType: 'personal',
  isPersonal: true,
  isBusiness: false,
})

export function ProductTypeProvider({
  productType,
  children,
}: {
  productType: ProductType
  children: React.ReactNode
}) {
  return (
    <ProductTypeContext.Provider
      value={{
        productType,
        isPersonal: productType === 'personal',
        isBusiness: productType === 'business',
      }}
    >
      {children}
    </ProductTypeContext.Provider>
  )
}

export function useProductType() {
  return useContext(ProductTypeContext)
}
