import { test, expect } from '@playwright/test';

test('API-driven dashboard filters, facility details, forecast, and CSV export',async({page},testInfo)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#/app');
  await expect(page.getByText('Monitored facilities')).toBeVisible();
  await expect(page.getByText('Energy consumed',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Date range'}).selectOption('1');
  await expect(page.getByText('Monitored facilities')).toBeVisible();
  // Compare DOM geometry to the viewport so mobile overflow becomes a regression failure.
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/dashboard-${testInfo.project.name}.png`,fullPage:true});
  await page.goto('/#/app/facilities');
  await page.getByRole('textbox',{name:'Search facilities'}).fill('Franklin');
  await page.getByRole('link',{name:'Franklin Logistics Hub',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Demand & anomaly signals'})).toBeVisible();
  await page.getByRole('combobox',{name:'Anomaly threshold'}).selectOption('4');
  await page.getByRole('link',{name:'Run forecast'}).click();
  await page.getByRole('button',{name:'Generate forecast'}).click();
  await expect(page.getByText('MEAN ABSOLUTE ERROR')).toBeVisible();
  await page.goto('/#/app/reports');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download CSV report'}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('gridpulse-energy.csv');
  await expect(page.getByText('Your CSV report is ready.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('public case study and demo navigation are accessible',async({page},testInfo)=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/See the signal/})).toBeVisible();
  await page.screenshot({path:`test-results/landing-${testInfo.project.name}.png`,fullPage:true});
  await page.getByRole('link',{name:'Open the workspace'}).click();
  await expect(page.getByText('Monitored facilities')).toBeVisible();
  if(testInfo.project.name==='mobile')await page.getByRole('button',{name:'Open navigation'}).click();
  await page.getByRole('link',{name:'Incidents',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Incident queue'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Acknowledge'})).toHaveCount(0);
});
