const st = 'https://www.st.com/en/microcontrollers-microprocessors/';
const store = 'https://estore.st.com/en/products/microcontrollers-microprocessors/stm32-32-bit-arm-cortex-mcus/';

export const cmsisIndexUrl = 'https://www.keil.com/pack/index.pidx';
export const stManufacturer = { id: 'st', name: 'STMicroelectronics' };

export const stScope = [
  {
    model: 'STM32F103C8',
    family: 'STM32F1',
    pack: 'STM32F1xx_DFP',
    productUrl: store + 'stm32-mainstream-mcus/stm32f1-series/stm32f103/stm32f103c8.html',
    documentationUrl: st + 'stm32f103/documentation.html',
    orders: ['STM32F103C8T6'],
    documents: ['DS5319', 'ES096', 'RM0008'],
  },
  {
    model: 'STM32F407VE',
    family: 'STM32F4',
    pack: 'STM32F4xx_DFP',
    productUrl: store + 'stm32-high-performance-mcus/stm32f4-series/stm32f407-417/stm32f407ve.html',
    documentationUrl: st + 'stm32f407-417/documentation.html',
    orders: ['STM32F407VET6', 'STM32F407VET6TR'],
    documents: ['DS8626', 'ES0182', 'RM0090'],
  },
  {
    model: 'STM32F407VG',
    family: 'STM32F4',
    pack: 'STM32F4xx_DFP',
    productUrl: store + 'stm32-high-performance-mcus/stm32f4-series/stm32f407-417/stm32f407vg.html',
    documentationUrl: st + 'stm32f407-417/documentation.html',
    orders: ['STM32F407VGT6'],
    documents: ['DS8626', 'ES0182', 'RM0090'],
  },
] as const;
