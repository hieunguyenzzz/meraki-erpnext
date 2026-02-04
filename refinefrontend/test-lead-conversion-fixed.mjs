import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('1. Navigating to login page...');
    await page.goto('http://frontend.merakierp.loc/login', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await page.waitForTimeout(2000);
    
    console.log('2. Taking screenshot of login page...');
    await page.screenshot({ path: '/tmp/login-page.png', fullPage: true });
    
    // Get all input elements
    const inputs = await page.$$('input');
    console.log(`   Found ${inputs.length} input elements`);
    
    console.log('3. Filling in login credentials...');
    // Fill first input (username/email)
    await page.locator('input').first().fill('Administrator');
    // Fill second input (password)
    await page.locator('input').nth(1).fill('admin');
    
    await page.screenshot({ path: '/tmp/login-filled.png', fullPage: true });
    console.log('   Login form filled screenshot saved');
    
    console.log('4. Clicking Sign in button...');
    await page.click('button:has-text("Sign in")');
    
    console.log('5. Waiting for login to complete...');
    await page.waitForTimeout(4000);
    
    console.log('   Current URL after login:', page.url());
    await page.screenshot({ path: '/tmp/after-login.png', fullPage: true });
    console.log('   After login screenshot saved');
    
    // Check if we're still on login page (login failed)
    if (page.url().includes('/login')) {
      console.log('   Still on login page - login may have failed');
      const errorMessage = await page.textContent('body');
      console.log('   Page content:', errorMessage?.substring(0, 500));
    }
    
    console.log('6. Navigating to Lead detail page...');
    await page.goto('http://frontend.merakierp.loc/crm/leads/CRM-LEAD-2026-00002', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await page.waitForTimeout(2000);
    
    console.log('7. Taking screenshot of Lead page...');
    await page.screenshot({ path: '/tmp/lead-detail-before.png', fullPage: true });
    console.log('   Screenshot saved to /tmp/lead-detail-before.png');
    
    console.log('   Current URL:', page.url());
    console.log('   Page title:', await page.title());
    
    // If we got redirected to login, stop here
    if (page.url().includes('/login')) {
      console.log('   Redirected back to login - authentication failed');
      await browser.close();
      return;
    }
    
    console.log('8. Looking for Convert to Opportunity button...');
    
    // Get all button text on the page
    const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent?.trim()));
    console.log('   Available buttons:', buttons);
    
    // Try to find the button
    const buttonSelectors = [
      'button:has-text("Convert to Opportunity")',
      'button:has-text("Convert")',
      '[data-testid="convert-button"]',
      'button.convert-opportunity'
    ];
    
    let button = null;
    for (const selector of buttonSelectors) {
      try {
        button = await page.waitForSelector(selector, { timeout: 3000 });
        if (button) {
          console.log(`   Found button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!button) {
      console.log('   Convert button not found on page');
      await browser.close();
      return;
    }
    
    console.log('9. Clicking Convert to Opportunity button...');
    await button.click();
    
    console.log('10. Waiting for confirmation dialog...');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/lead-conversion-dialog.png', fullPage: true });
    console.log('    Dialog screenshot saved');
    
    // Look for confirmation button
    const confirmSelectors = [
      'button:has-text("Convert")',
      'button:has-text("Confirm")',
      'button:has-text("OK")',
      'button:has-text("Yes")'
    ];
    
    let confirmButton = null;
    for (const selector of confirmSelectors) {
      try {
        confirmButton = await page.waitForSelector(selector, { timeout: 2000 });
        if (confirmButton) {
          console.log(`    Found confirm button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!confirmButton) {
      console.log('    Confirmation button not found');
      await browser.close();
      return;
    }
    
    console.log('11. Clicking confirmation button...');
    await confirmButton.click();
    
    console.log('12. Waiting for navigation to Opportunity page...');
    await page.waitForTimeout(4000);
    
    console.log('13. Taking screenshot of result...');
    await page.screenshot({ path: '/tmp/lead-conversion-result.png', fullPage: true });
    console.log('    Screenshot saved to /tmp/lead-conversion-result.png');
    
    console.log('    Final URL:', page.url());
    console.log('    Page title:', await page.title());
    
  } catch (error) {
    console.error('Error during test:', error.message);
    await page.screenshot({ path: '/tmp/lead-conversion-error.png', fullPage: true });
    console.log('Error screenshot saved to /tmp/lead-conversion-error.png');
  } finally {
    await browser.close();
    console.log('\nTest complete!');
  }
})();
