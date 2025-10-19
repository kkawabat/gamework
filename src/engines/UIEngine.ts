/**
 * UIEngine - Pure UI rendering for GameWork v2
 * 
 * Provides clean UI management with:
 * - Pure rendering functions
 * - No business logic
 * - Easy testing
 * - Type safety
 */

import { BaseGameState, GameRoom, UIEngine as IUIEngine } from '../types/GameTypes';

export abstract class UIEngine<TState extends BaseGameState> implements IUIEngine<TState> {
  protected isInitialized: boolean = false;
  protected currentState?: TState;
  protected currentRoom?: GameRoom;

  abstract render(state: TState): void;
  abstract initialize(): void;
  abstract destroy(): void;
  abstract updateRoom(room: GameRoom): void;

  // Utility methods for common UI operations
  protected createElement(tag: string, className?: string, textContent?: string): HTMLElement {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (textContent) {
      element.textContent = textContent;
    }
    return element;
  }

  protected updateElement(element: HTMLElement, updates: Partial<HTMLElement>): void {
    Object.assign(element, updates);
  }

  protected addEventListener(element: HTMLElement, event: string, handler: EventListener): () => void {
    element.addEventListener(event, handler);
    return () => element.removeEventListener(event, handler);
  }

  protected removeAllChildren(element: HTMLElement): void {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  protected showElement(element: HTMLElement): void {
    element.style.display = '';
  }

  protected hideElement(element: HTMLElement): void {
    element.style.display = 'none';
  }

  protected addClass(element: HTMLElement, className: string): void {
    element.classList.add(className);
  }

  protected removeClass(element: HTMLElement, className: string): void {
    element.classList.remove(className);
  }

  protected toggleClass(element: HTMLElement, className: string): void {
    element.classList.toggle(className);
  }

  protected setText(element: HTMLElement, text: string): void {
    element.textContent = text;
  }

  protected setHTML(element: HTMLElement, html: string): void {
    element.innerHTML = html;
  }

  protected getElementById(id: string): HTMLElement | null {
    return document.getElementById(id);
  }

  protected getElementsByClassName(className: string): HTMLCollectionOf<Element> {
    return document.getElementsByClassName(className);
  }

  protected querySelector(selector: string): Element | null {
    return document.querySelector(selector);
  }

  protected querySelectorAll(selector: string): NodeListOf<Element> {
    return document.querySelectorAll(selector);
  }

  // Event handling utilities
  protected createButton(text: string, onClick: () => void, className?: string): HTMLButtonElement {
    const button = this.createElement('button', className, text) as HTMLButtonElement;
    this.addEventListener(button, 'click', onClick);
    return button;
  }

  protected createInput(type: string, placeholder?: string, className?: string): HTMLInputElement {
    const input = this.createElement('input', className) as HTMLInputElement;
    input.type = type;
    if (placeholder) {
      input.placeholder = placeholder;
    }
    return input;
  }

  protected createDiv(className?: string, textContent?: string): HTMLDivElement {
    return this.createElement('div', className, textContent) as HTMLDivElement;
  }

  protected createSpan(className?: string, textContent?: string): HTMLSpanElement {
    return this.createElement('span', className, textContent) as HTMLSpanElement;
  }

  // Animation utilities
  protected fadeIn(element: HTMLElement, duration: number = 300): void {
    element.style.opacity = '0';
    element.style.transition = `opacity ${duration}ms ease-in-out`;
    
    requestAnimationFrame(() => {
      element.style.opacity = '1';
    });
  }

  protected fadeOut(element: HTMLElement, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      element.style.transition = `opacity ${duration}ms ease-in-out`;
      element.style.opacity = '0';
      
      setTimeout(() => {
        this.hideElement(element);
        resolve();
      }, duration);
    });
  }

  protected slideIn(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down' = 'left'): void {
    const directions = {
      left: { transform: 'translateX(-100%)', to: 'translateX(0)' },
      right: { transform: 'translateX(100%)', to: 'translateX(0)' },
      up: { transform: 'translateY(-100%)', to: 'translateY(0)' },
      down: { transform: 'translateY(100%)', to: 'translateY(0)' }
    };

    const dir = directions[direction];
    element.style.transform = dir.transform;
    element.style.transition = 'transform 300ms ease-in-out';
    
    requestAnimationFrame(() => {
      element.style.transform = dir.to;
    });
  }

  protected slideOut(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down' = 'left'): Promise<void> {
    return new Promise((resolve) => {
      const directions = {
        left: 'translateX(-100%)',
        right: 'translateX(100%)',
        up: 'translateY(-100%)',
        down: 'translateY(100%)'
      };

      element.style.transition = 'transform 300ms ease-in-out';
      element.style.transform = directions[direction];
      
      setTimeout(() => {
        this.hideElement(element);
        resolve();
      }, 300);
    });
  }
}
