#![no_std]
extern crate alloc;

#[cfg(not(test))]
use alloc::alloc::alloc;
#[cfg(not(test))]
use core::alloc::{GlobalAlloc, Layout};
#[cfg(not(test))]
use core::panic::PanicInfo;

// The core ffi uses Box (alloc) to manage MoogSaw lifetimes over the C-ABI.
// wasm32-unknown-unknown has no default global allocator, so a cdylib that
// allocates must provide one. A simple bump allocator over a static heap
// suffices: every moog_saw_create returns a pointer that lives until
// moog_saw_destroy (or process teardown), and the js-side moog_saw_alloc
// reserves the fixed per-instance input/output buffers once at init.

#[cfg(not(test))]
struct WasmAllocator;

#[cfg(not(test))]
const HEAP_SIZE: usize = 1 << 20; // 1 MiB static heap

#[cfg(not(test))]
static mut HEAP: [u8; HEAP_SIZE] = [0u8; HEAP_SIZE];

#[cfg(not(test))]
static mut OFFSET: usize = 0;

#[cfg(not(test))]
unsafe impl GlobalAlloc for WasmAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let align = layout.align();
        let size = layout.size();
        unsafe {
            let start = OFFSET;
            let aligned = (start + align - 1) & !(align - 1);
            if aligned + size > HEAP_SIZE {
                return core::ptr::null_mut();
            }
            OFFSET = aligned + size;
            core::ptr::addr_of_mut!(HEAP).cast::<u8>().add(aligned)
        }
    }

    unsafe fn dealloc(&self, _ptr: *mut u8, _layout: Layout) {
        // Bump allocator never reclaims; adequate for fixed-lifetime use.
    }
}

#[cfg(not(test))]
#[global_allocator]
static ALLOC: WasmAllocator = WasmAllocator;

#[cfg(not(test))]
#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

#[cfg(not(test))]
#[cfg(not(target_arch = "wasm32"))]
#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}

// Re-export every C-ABI function from the core crate's public ffi module.
pub use moog_saw::ffi::*;

// The single JS-callable allocation primitive. Used once at processor init to
// reserve the fixed freq/sync/output buffers. There is intentionally NO
// malloc/free/dealloc exposed: buffers live for the life of the instance.
#[cfg(not(test))]
#[unsafe(no_mangle)]
pub extern "C" fn moog_saw_alloc(size: usize) -> *mut u8 {
    let layout = Layout::from_size_align(size, 8).unwrap();
    unsafe { alloc(layout) }
}
